import fs from "node:fs";
import path from "node:path";
import { uuidv7 } from "@earendil-works/pi-ai";
import { getAgentDir, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { DreamApprovalGuard } from "./approval.ts";
import {
  buildDreamEditorPrompt,
  buildDreamReport,
  parseDreamModelResponse,
  preserveCapturedProjectMapping,
  selectEligibleSessions,
} from "./core.ts";
import {
  createActiveSessionLease,
  createSessionAnalysisClaim,
  listActiveSessionHashes,
  refreshActiveSessionLease,
  releaseActiveSessionLease,
  releaseSessionAnalysisClaim,
  type ActiveSessionLease,
  type SessionAnalysisClaim,
} from "./lease.ts";
import { buildDreamUserPrompt, DREAM_SYSTEM_PROMPT, type DreamPromptSession } from "./prompts.ts";
import { readBoundedSessionSnapshot, scanSessionHeaders, sessionIdentityHash } from "./session-reader.ts";
import { readDreamLedger, updateDreamLedger } from "./storage.ts";
import type {
  DreamLedger,
  DreamMappingBasis,
  DreamProjectMapping,
  DreamProjectReport,
  DreamSelectedSession,
  DreamSessionHeader,
  DreamSessionSnapshot,
} from "./types.ts";
import { canonicalRemoteIdentity, deriveProjectName } from "../zikra/core.ts";
import { sanitizeTerminalLine, sanitizeTerminalText } from "../shared/terminal-text.ts";

interface DreamConfig {
  defaultSessionLimit: number;
  maximumSessionLimit: number;
  maximumProjects: number;
  maximumSessionsPerProject: number;
  minimumSessionAgeMinutes: number;
  maximumHeaderFiles: number;
  maximumHeaderBytes: number;
  maximumSessionFileBytes: number;
  maximumSessionLineBytes: number;
  maximumSessionEntries: number;
  maximumMessagesPerSession: number;
  maximumCharsPerMessage: number;
  maximumCharsPerSession: number;
  maximumAggregateInputBytes: number;
  maximumInsightsPerProject: number;
  maximumModelResponseBytes: number;
  modelTimeoutMs: number;
  reminderEligibleSessions: number;
  reminderCooldownHours: number;
  ledgerMaximumEntries: number;
}

const config = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "config.json"), "utf8")) as DreamConfig;
const sessionsRoot = () => path.join(getAgentDir(), "sessions");
const minimumAgeMs = () => config.minimumSessionAgeMinutes * 60_000;

interface ResolvedProject {
  mapping: DreamProjectMapping;
  root: string;
}

async function resolveProject(pi: ExtensionAPI, cwd: string): Promise<ResolvedProject | undefined> {
  if (!path.isAbsolute(cwd) || /[\r\n\0]/u.test(cwd)) return undefined;
  const rootResult = await pi.exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { timeout: 3_000 });
  const root = rootResult.stdout.trim();
  if (rootResult.code !== 0 || !path.isAbsolute(root) || /[\r\n\0]/u.test(root)) return undefined;
  const remoteResult = await pi.exec("git", ["-C", root, "config", "--get", "remote.origin.url"], { timeout: 3_000 });
  if (remoteResult.code !== 0) return undefined;
  const repository = canonicalRemoteIdentity(remoteResult.stdout);
  if (!repository || repository.length > 240 || /[\r\n\0]/u.test(repository)) return undefined;
  return {
    root,
    mapping: {
      project: deriveProjectName(remoteResult.stdout, root, "main"),
      repository,
      capturedAt: new Date().toISOString(),
    },
  };
}

function parseDreamArgs(args: string | undefined): { limit: number; revisit: boolean } | undefined {
  const tokens = (args ?? "").trim().split(/\s+/u).filter(Boolean);
  let limit = config.defaultSessionLimit;
  let revisit = false;
  for (const token of tokens) {
    if (token === "--revisit") {
      revisit = true;
      continue;
    }
    if (/^\d+$/u.test(token)) {
      limit = Number.parseInt(token, 10);
      continue;
    }
    return undefined;
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > config.maximumSessionLimit) return undefined;
  return { limit, revisit };
}

function modelDestination(model: { provider: string; id: string; baseUrl?: string }): string {
  try {
    const parsed = new URL(model.baseUrl ?? "");
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "provider-managed endpoint";
  }
}

function messageText(response: any): string | undefined {
  if (response?.stopReason === "toolUse") return undefined;
  if (!Array.isArray(response?.content) || response.content.some((part: any) => part?.type === "toolCall")) return undefined;
  const text = response.content
    .filter((part: any) => part?.type === "text" && typeof part.text === "string")
    .map((part: any) => part.text)
    .join("\n")
    .trim();
  return text || undefined;
}

interface ApprovedModel {
  model: NonNullable<ExtensionCommandContext["model"]>;
  provider: ReturnType<ExtensionCommandContext["modelRegistry"]["getProvider"]>;
  requestAuth: { apiKey?: string; headers?: Record<string, string | null>; env?: Record<string, string> };
}

async function resolveApprovedModel(ctx: ExtensionCommandContext): Promise<ApprovedModel> {
  if (!ctx.model) throw new Error("No model selected");
  const selectedModel = ctx.model;
  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(selectedModel);
  if (!auth.ok) throw new Error(auth.error);
  const provider = ctx.modelRegistry.getProvider(selectedModel.provider);
  if (!provider) throw new Error("The selected model provider is unavailable");
  const effectiveBaseUrl = auth.baseUrl ?? selectedModel.baseUrl ?? provider.baseUrl;
  if (typeof effectiveBaseUrl !== "string" || !effectiveBaseUrl) throw new Error("The selected model has no effective endpoint");
  return {
    model: { ...selectedModel, baseUrl: effectiveBaseUrl },
    provider,
    requestAuth: { apiKey: auth.apiKey, headers: auth.headers, env: auth.env },
  };
}

async function distillProject(
  ctx: ExtensionCommandContext,
  approved: ApprovedModel,
  repository: string,
  sessions: DreamPromptSession[],
  lifecycleSignal: AbortSignal,
): Promise<{ insights: DreamProjectReport["insights"]; outputRedactions: number } | undefined> {
  const allowedHashes = new Set(sessions.map((session) => session.hash));
  const userPrompt = buildDreamUserPrompt(repository, sessions);

  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = attempt === 0
      ? userPrompt
      : `${userPrompt}\n\nYour prior output was invalid. Return only the exact JSON schema from the system prompt.`;
    const signal = AbortSignal.any([lifecycleSignal, AbortSignal.timeout(config.modelTimeoutMs)]);
    const response = await approved.provider!.stream(
      approved.model,
      {
        systemPrompt: DREAM_SYSTEM_PROMPT,
        messages: [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }],
      },
      {
        ...approved.requestAuth,
        maxTokens: 4096,
        cacheRetention: "none",
        sessionId: uuidv7(),
        signal,
      } as any,
    ).result();
    const text = messageText(response);
    if (!text || Buffer.byteLength(text) > config.maximumModelResponseBytes) continue;
    const parsed = parseDreamModelResponse(text, allowedHashes, config.maximumInsightsPerProject);
    if (parsed.ok) return { insights: parsed.insights, outputRedactions: parsed.redactions };
  }
  return undefined;
}

interface PreparedSession {
  selected: DreamSelectedSession;
  snapshot: DreamSessionSnapshot;
  basis: DreamMappingBasis;
}

const groupPrepared = (prepared: PreparedSession[]) => {
  const groups = new Map<string, PreparedSession[]>();
  for (const item of prepared) {
    const existing = groups.get(item.selected.mapping.project) ?? [];
    existing.push(item);
    groups.set(item.selected.mapping.project, existing);
  }
  return groups;
};

async function loadHeaders(): Promise<DreamSessionHeader[]> {
  return scanSessionHeaders(sessionsRoot(), {
    maxFiles: config.maximumHeaderFiles,
    maxHeaderBytes: config.maximumHeaderBytes,
  });
}

async function runDream(
  args: string | undefined,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  lifecycleSignal: AbortSignal,
  onReportPending: (digest: string) => void,
): Promise<void> {
  const parsedArgs = parseDreamArgs(args);
  if (!parsedArgs) {
    ctx.ui.notify(`Usage: /dream [1-${config.maximumSessionLimit}] [--revisit]`, "warning");
    return;
  }
  if (!ctx.hasUI) {
    console.error("Dreaming requires an interactive approval UI.");
    return;
  }
  if (!ctx.model || !ctx.modelRegistry.hasConfiguredAuth(ctx.model)) {
    ctx.ui.notify("Dreaming requires a selected model with configured authentication.", "warning");
    return;
  }
  let approvedModel: ApprovedModel;
  try {
    approvedModel = await resolveApprovedModel(ctx);
  } catch (error) {
    ctx.ui.notify(`Dream model unavailable: ${sanitizeTerminalText(error instanceof Error ? error.message : String(error))}`, "warning");
    return;
  }

  let ledger: DreamLedger;
  let headers: DreamSessionHeader[];
  let activeSessionHashes: Set<string>;
  try {
    [ledger, headers, activeSessionHashes] = await Promise.all([
      readDreamLedger(getAgentDir()),
      loadHeaders(),
      listActiveSessionHashes(getAgentDir()),
    ]);
  } catch (error) {
    ctx.ui.notify(`Dream metadata unavailable: ${sanitizeTerminalText(error instanceof Error ? error.message : String(error))}`, "error");
    return;
  }

  const workingLedger = structuredClone(ledger);
  const basisByIdentity = new Map<string, DreamMappingBasis>();
  const resolutionCache = new Map<string, ResolvedProject | undefined>();
  let unresolved = 0;

  for (const header of headers) {
    const identity = sessionIdentityHash(header.id, header.cwd);
    let resolved = resolutionCache.get(header.cwd);
    if (!resolutionCache.has(header.cwd)) {
      resolved = await resolveProject(pi, header.cwd);
      resolutionCache.set(header.cwd, resolved);
    }
    if (!resolved) {
      unresolved++;
      continue;
    }
    const captured = ledger.projectMappings[identity];
    if (captured) {
      if (captured.project !== resolved.mapping.project || captured.repository !== resolved.mapping.repository) {
        unresolved++;
        continue;
      }
      workingLedger.projectMappings[identity] = captured;
      basisByIdentity.set(identity, "captured");
    } else {
      workingLedger.projectMappings[identity] = resolved.mapping;
      basisByIdentity.set(identity, "legacy-current-remote");
    }
  }

  const candidates = selectEligibleSessions(headers, workingLedger, {
    now: Date.now(),
    currentSessionId: ctx.sessionManager.getSessionId(),
    minSessionAgeMs: minimumAgeMs(),
    maxSessions: config.maximumHeaderFiles,
    revisit: parsedArgs.revisit,
    activeSessionHashes,
  });
  const selected: DreamSelectedSession[] = [];
  const perProject = new Map<string, number>();
  for (const candidate of candidates) {
    const projectCount = perProject.get(candidate.mapping.project) ?? 0;
    if (projectCount >= config.maximumSessionsPerProject) continue;
    if (!perProject.has(candidate.mapping.project) && perProject.size >= config.maximumProjects) continue;
    selected.push(candidate);
    perProject.set(candidate.mapping.project, projectCount + 1);
    if (selected.length >= parsedArgs.limit) break;
  }

  if (selected.length === 0) {
    ctx.ui.notify(unresolved > 0
      ? `No eligible mapped sessions. ${unresolved} ambiguous or unavailable session(s) were skipped.`
      : "No eligible undreamed sessions were found.", "info");
    return;
  }

  const repositories = [...new Set(selected.map((item) => item.mapping.repository))];
  const manifestPreview = repositories.slice(0, 6).map((item) => `• ${sanitizeTerminalLine(item)}`).join("\n");
  const localConsent = await ctx.ui.confirm(
    "Prepare Dream Report?",
    [
      `Read bounded user/assistant text from ${selected.length} inactive or unleased session file(s) across ${repositories.length} repository group(s)?`,
      "Live sessions with Dream leases are excluded. Legacy Pi processes without this extension cannot be detected, so confirm that the listed repository groups may be analyzed.",
      "Thinking, images, custom messages, summaries, tool calls, and tool results are excluded. No content buffer is written.",
      manifestPreview,
      unresolved > 0 ? `${unresolved} ambiguous session(s) will remain skipped.` : "",
    ].filter(Boolean).join("\n"),
  );
  if (!localConsent) return;

  const prepared: PreparedSession[] = [];
  let aggregateBytes = 0;
  let skipped = 0;
  const activeAfterConsent = await listActiveSessionHashes(getAgentDir());
  for (const item of selected) {
    if (activeAfterConsent.has(item.identityHash)) {
      skipped++;
      continue;
    }
    const snapshot = await readBoundedSessionSnapshot(item.path, item, {
      maxFileBytes: config.maximumSessionFileBytes,
      maxLineBytes: config.maximumSessionLineBytes,
      maxEntries: config.maximumSessionEntries,
      maxMessages: config.maximumMessagesPerSession,
      maxCharsPerMessage: config.maximumCharsPerMessage,
      maxCharsPerSession: config.maximumCharsPerSession,
    });
    if (snapshot.status !== "ok" || !snapshot.messages.some((message) => message.role === "user") || !snapshot.messages.some((message) => message.role === "assistant")) {
      skipped++;
      continue;
    }
    if (aggregateBytes + snapshot.inputBytes > config.maximumAggregateInputBytes) {
      skipped++;
      continue;
    }
    aggregateBytes += snapshot.inputBytes;
    prepared.push({ selected: item, snapshot, basis: basisByIdentity.get(item.identityHash) ?? "legacy-current-remote" });
  }
  const activeBeforeDisclosure = await listActiveSessionHashes(getAgentDir());
  for (let index = prepared.length - 1; index >= 0; index--) {
    if (activeBeforeDisclosure.has(prepared[index]!.selected.identityHash)) {
      prepared.splice(index, 1);
      skipped++;
    }
  }

  const exactPromptBytes = () => {
    let bytes = 0;
    for (const items of groupPrepared(prepared).values()) {
      const promptSessions = items.map((item): DreamPromptSession => ({
        hash: item.selected.identityHash,
        observedAt: new Date(item.selected.modifiedMs).toISOString(),
        snapshot: item.snapshot,
      }));
      bytes += Buffer.byteLength(buildDreamUserPrompt(items[0]!.selected.mapping.repository, promptSessions));
    }
    return bytes;
  };
  aggregateBytes = exactPromptBytes();
  while (prepared.length > 0 && aggregateBytes > config.maximumAggregateInputBytes) {
    prepared.pop();
    skipped++;
    aggregateBytes = exactPromptBytes();
  }
  if (prepared.length === 0) {
    ctx.ui.notify("No sessions remained after bounded snapshot validation.", "warning");
    return;
  }

  const redactions = prepared.reduce((sum, item) => sum + item.snapshot.redactions, 0);
  const sourceProviders = [...new Set(prepared.flatMap((item) => item.snapshot.providers))];
  const destination = modelDestination(approvedModel.model as any);
  const providerConsent = await ctx.ui.confirm(
    "Send bounded excerpts to model?",
    [
      `Destination: ${sanitizeTerminalLine(approvedModel.model.provider)}/${sanitizeTerminalLine(approvedModel.model.id)} at ${sanitizeTerminalLine(destination)}`,
      `Payload: ${aggregateBytes.toLocaleString()} bytes from ${prepared.length} session(s); ${redactions} redaction/truncation event(s).`,
      sourceProviders.length > 0 ? `Original session providers: ${sourceProviders.map(sanitizeTerminalLine).join(", ")}` : "Original session provider metadata unavailable.",
      "Each project may require up to two bounded distillation attempts. Pattern redaction is defense-in-depth, not a guarantee. Confirm only if these historical sessions may be disclosed to this provider.",
    ].join("\n"),
  );
  if (!providerConsent) return;

  const reports: DreamProjectReport[] = [];
  const successfulSessionKeys = new Set<string>();
  for (const [project, items] of groupPrepared(prepared)) {
    ctx.ui.setStatus("dream", `Dreaming: ${sanitizeTerminalLine(items[0]!.selected.mapping.repository)}`);
    const claims: SessionAnalysisClaim[] = [];
    try {
      const claimedItems: PreparedSession[] = [];
      for (const item of items) {
        const claim = await createSessionAnalysisClaim(getAgentDir(), item.selected.identityHash);
        if (!claim) {
          skipped++;
          continue;
        }
        claims.push(claim);
        const verified = await readBoundedSessionSnapshot(item.selected.path, item.selected, {
          maxFileBytes: config.maximumSessionFileBytes,
          maxLineBytes: config.maximumSessionLineBytes,
          maxEntries: config.maximumSessionEntries,
          maxMessages: config.maximumMessagesPerSession,
          maxCharsPerMessage: config.maximumCharsPerMessage,
          maxCharsPerSession: config.maximumCharsPerSession,
        });
        if (verified.status !== "ok" || verified.inputDigest !== item.snapshot.inputDigest) {
          skipped++;
          continue;
        }
        claimedItems.push({ ...item, snapshot: verified });
      }
      if (claimedItems.length === 0) continue;

      let mappingValid = true;
      for (const cwd of new Set(claimedItems.map((item) => item.selected.cwd))) {
        const current = await resolveProject(pi, cwd);
        if (
          !current ||
          current.mapping.project !== project ||
          current.mapping.repository !== claimedItems[0]!.selected.mapping.repository
        ) {
          mappingValid = false;
          break;
        }
      }
      if (!mappingValid) {
        skipped += claimedItems.length;
        continue;
      }
      const promptSessions = claimedItems.map((item): DreamPromptSession => ({
        hash: item.selected.identityHash,
        observedAt: new Date(item.selected.modifiedMs).toISOString(),
        snapshot: item.snapshot,
      }));
      const result = await distillProject(ctx, approvedModel, claimedItems[0]!.selected.mapping.repository, promptSessions, lifecycleSignal);
      if (!result || result.insights.length === 0) continue;
      const mappingBasis: DreamMappingBasis = claimedItems.some((item) => item.basis === "legacy-current-remote")
        ? "legacy-current-remote"
        : "captured";
      reports.push({
        project,
        repository: claimedItems[0]!.selected.mapping.repository,
        mappingBasis,
        sessionCount: claimedItems.length,
        inputBytes: claimedItems.reduce((sum, item) => sum + item.snapshot.inputBytes, 0),
        redactions: claimedItems.reduce((sum, item) => sum + item.snapshot.redactions, 0) + result.outputRedactions,
        insights: result.insights,
      });
      claimedItems.forEach((item) => successfulSessionKeys.add(item.selected.analysisKey));
    } catch (error) {
      ctx.ui.notify(`Dream distillation skipped one project: ${sanitizeTerminalText(error instanceof Error ? error.message : String(error))}`, "warning");
    } finally {
      await Promise.all(claims.map((claim) => releaseSessionAnalysisClaim(claim)));
    }
  }
  ctx.ui.setStatus("dream", undefined);

  if (reports.length === 0) {
    ctx.ui.notify("No durable candidate knowledge was produced.", "info");
    return;
  }

  const report = buildDreamReport(reports, { provider: approvedModel.model.provider, model: approvedModel.model.id });
  const editorPrompt = buildDreamEditorPrompt(report);
  const reviewedPrompt = await ctx.ui.editor("Review Dream Report", editorPrompt);
  if (reviewedPrompt === undefined || !reviewedPrompt.trim()) return;

  let metadataConflict = false;
  try {
    await updateDreamLedger(getAgentDir(), (next) => {
      const successful = prepared.filter((item) => successfulSessionKeys.has(item.selected.analysisKey));
      metadataConflict = successful.some((item) => {
        const existing = next.projectMappings[item.selected.identityHash];
        return !!existing && (
          existing.project !== item.selected.mapping.project ||
          existing.repository !== item.selected.mapping.repository
        );
      });
      if (metadataConflict) return next;
      for (const item of successful) {
        preserveCapturedProjectMapping(next, item.selected.identityHash, item.selected.mapping);
        next.analyses[item.selected.analysisKey] = {
          project: item.selected.mapping.project,
          analyzedAt: new Date().toISOString(),
          reportDigest: report.digest,
        };
      }
      return next;
    }, { maxEntries: config.ledgerMaximumEntries });
  } catch (error) {
    ctx.ui.notify(`Dream report discarded because analysis metadata could not be finalized: ${sanitizeTerminalText(error instanceof Error ? error.message : String(error))}`, "warning");
    return;
  }
  if (metadataConflict) {
    ctx.ui.notify("Dream report discarded because a project mapping changed before finalization.", "warning");
    return;
  }

  onReportPending(report.digest);
  ctx.ui.setEditorText(reviewedPrompt);
  ctx.ui.notify(`Dream Report ready from ${prepared.length} session(s)${skipped ? `; ${skipped} skipped` : ""}. Press Enter to begin governed review.`, "info");
}

export default function dreamExtension(pi: ExtensionAPI) {
  let activeLease: ActiveSessionLease | undefined;
  let leaseTimer: ReturnType<typeof setInterval> | undefined;
  let activeDream: AbortController | undefined;
  const approvalGuard = new DreamApprovalGuard();

  const appendApprovalState = (status: "pending" | "terminal" | "cleared", digest?: string, planDigest?: string) => {
    pi.appendEntry("dream-approval-state", {
      status,
      digest,
      planDigest,
      completedOperationDigests: approvalGuard.getCompletedOperationDigests(),
      timestamp: new Date().toISOString(),
    });
  };
  const setPendingCandidate = (digest: string) => {
    approvalGuard.setPendingCandidate(digest);
    appendApprovalState("pending", digest);
  };

  pi.registerCommand("dream", {
    description: "Distill governed memory candidates from past sessions",
    handler: async (args, ctx) => {
      activeDream?.abort();
      const controller = new AbortController();
      activeDream = controller;
      try {
        await runDream(args, ctx, pi, controller.signal, setPendingCandidate);
      } finally {
        if (activeDream === controller) activeDream = undefined;
      }
    },
  });

  pi.on("tool_call", async (event) => {
    const decision = event.toolName === "ask_user"
      ? approvalGuard.checkAskCall(event.toolCallId, event.input)
      : event.toolName === "mcp"
        ? approvalGuard.checkMcpCall(event.toolCallId, event.input)
        : { block: false };
    if (decision.block) return { block: true, reason: decision.reason };
  });

  pi.on("tool_result", async (event) => {
    if (event.toolName === "ask_user") {
      const candidateDigest = approvalGuard.pendingCandidateDigest;
      const outcome = approvalGuard.recordAskResult(event.toolCallId, event.details, event.isError);
      if (outcome === "approved") {
        appendApprovalState("pending", approvalGuard.pendingCandidateDigest, approvalGuard.approvedPlanDigest);
      } else if (outcome === "rejected") {
        appendApprovalState("terminal", candidateDigest);
      }
      return;
    }
    if (event.toolName === "mcp") {
      const candidateDigest = approvalGuard.pendingCandidateDigest;
      const outcome = approvalGuard.recordMcpResult(event.toolCallId, event.details, event.isError);
      if (outcome === "advanced") {
        appendApprovalState("pending", approvalGuard.pendingCandidateDigest, approvalGuard.approvedPlanDigest);
      } else if (outcome === "reconcile") {
        appendApprovalState("pending", approvalGuard.pendingCandidateDigest);
      } else if (outcome === "completed") {
        appendApprovalState("terminal", candidateDigest);
      }
    }
  });

  const restoreApprovalState = (entries: readonly any[]) => {
    approvalGuard.resetAll();
    let restoredStatus: "pending" | "terminal" | "cleared" = "cleared";
    let restoredDigest: string | undefined;
    let restoredCompletedDigests: unknown;
    for (const entry of entries) {
      if (entry.type !== "custom" || entry.customType !== "dream-approval-state") continue;
      const data = entry.data;
      restoredStatus = ["pending", "terminal", "cleared"].includes(data?.status) ? data.status : "cleared";
      restoredDigest = /^[a-f0-9]{64}$/u.test(data?.digest) ? data.digest : undefined;
      restoredCompletedDigests = data?.completedOperationDigests;
    }
    approvalGuard.restoreCompletedOperationDigests(restoredCompletedDigests);
    if (restoredStatus === "pending" && restoredDigest) approvalGuard.setPendingCandidate(restoredDigest);
    else if (restoredStatus === "terminal") approvalGuard.restoreTerminal();
  };

  pi.on("session_start", async (event, ctx) => {
    restoreApprovalState(ctx.sessionManager.getBranch());

    try {
      const identity = sessionIdentityHash(ctx.sessionManager.getSessionId(), ctx.cwd);
      activeLease = await createActiveSessionLease(getAgentDir(), identity);
      leaseTimer = setInterval(() => {
        if (activeLease) void refreshActiveSessionLease(activeLease).catch(() => undefined);
      }, 60_000);
      leaseTimer.unref?.();

      const resolved = await resolveProject(pi, ctx.cwd);
      if (resolved) {
        const identity = sessionIdentityHash(ctx.sessionManager.getSessionId(), ctx.cwd);
        await updateDreamLedger(getAgentDir(), (ledger) => {
          preserveCapturedProjectMapping(ledger, identity, resolved.mapping);
          return ledger;
        }, { maxEntries: config.ledgerMaximumEntries });
      }

      if (event.reason !== "startup" || !ctx.hasUI) return;
      const ledger = await readDreamLedger(getAgentDir());
      if (ledger.lastReminderAt && Date.now() - Date.parse(ledger.lastReminderAt) < config.reminderCooldownHours * 3_600_000) return;
      const [headers, activeSessionHashes] = await Promise.all([loadHeaders(), listActiveSessionHashes(getAgentDir())]);
      const eligible = selectEligibleSessions(headers, ledger, {
        now: Date.now(),
        currentSessionId: ctx.sessionManager.getSessionId(),
        minSessionAgeMs: minimumAgeMs(),
        maxSessions: config.reminderEligibleSessions,
        revisit: false,
        activeSessionHashes,
      });
      if (eligible.length < config.reminderEligibleSessions) return;
      ctx.ui.notify(`${eligible.length}+ inactive session snapshots are ready for governed review. Run /dream when convenient.`, "info");
      await updateDreamLedger(getAgentDir(), (next) => {
        next.lastReminderAt = new Date().toISOString();
        return next;
      }, { maxEntries: config.ledgerMaximumEntries });
    } catch (error) {
      if (ctx.hasUI) ctx.ui.notify(`Dream metadata check skipped: ${sanitizeTerminalText(error instanceof Error ? error.message : String(error))}`, "warning");
    }
  });

  pi.on("session_tree", async (_event, ctx) => {
    restoreApprovalState(ctx.sessionManager.getBranch());
  });

  pi.on("agent_settled", async () => {
    if (!approvalGuard.isTerminal()) return;
    approvalGuard.releaseTerminal();
    appendApprovalState("cleared");
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    activeDream?.abort();
    activeDream = undefined;
    approvalGuard.clear();
    if (leaseTimer) clearInterval(leaseTimer);
    leaseTimer = undefined;
    if (activeLease) await releaseActiveSessionLease(activeLease);
    activeLease = undefined;
    if (ctx.hasUI) ctx.ui.setStatus("dream", undefined);
  });
}
