import { createHash } from "node:crypto";
import path from "node:path";

export function trustedOpReadInvocation(agentDir: string, reference: string): { command: string; args: string[] } {
  if (!reference.startsWith("op://") || /[\r\n]/u.test(reference)) {
    throw new Error("Zikra token must use a valid 1Password reference");
  }
  return {
    command: "/bin/sh",
    args: [path.join(agentDir, "runtime", "op-read.sh"), reference],
  };
}

export interface SessionTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
}

export function normalizeProjectName(value: string, fallback = "main"): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\.git$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || fallback;
}

function canonicalRemoteIdentity(remote: string): string {
  const trimmed = remote.trim().replace(/[\\/]$/, "");
  if (!trimmed) return "";
  const scpMatch = trimmed.match(/^[^@/]+@([^:]+):(.+)$/);
  const urlText = scpMatch ? `ssh://${scpMatch[1]}/${scpMatch[2]}` : trimmed;
  try {
    const parsed = new URL(urlText);
    const repositoryPath = parsed.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
    return [parsed.hostname, repositoryPath].filter(Boolean).join("/");
  } catch {
    return "";
  }
}

function stableNamespace(identity: string, readableIdentity: string, fallback: string): string {
  const digest = createHash("sha256").update(identity.toLowerCase()).digest("hex").slice(0, 10);
  const readable = normalizeProjectName(readableIdentity, normalizeProjectName(fallback));
  const prefix = readable.slice(0, 69).replace(/-+$/g, "") || normalizeProjectName(fallback);
  return `${prefix}-${digest}`;
}

export function deriveProjectName(remote: string, gitRoot: string, fallback: string): string {
  const remoteIdentity = canonicalRemoteIdentity(remote);
  if (remoteIdentity) return stableNamespace(remoteIdentity, remoteIdentity, fallback);
  if (gitRoot.trim()) {
    const absoluteRoot = path.resolve(gitRoot.trim());
    return stableNamespace(`local:${absoluteRoot}`, path.basename(absoluteRoot), fallback);
  }
  return normalizeProjectName(fallback);
}

function usageFrom(entry: any): any | undefined {
  if (entry?.type !== "message") return undefined;
  const role = entry.message?.role;
  if (role !== "assistant" && role !== "toolResult") return undefined;
  return entry.message?.usage;
}

export function sessionUsage(entries: readonly any[]): SessionTotals {
  const totals: SessionTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 };
  for (const entry of entries) {
    const usage = usageFrom(entry);
    if (!usage) continue;
    totals.input += Number(usage.input) || 0;
    totals.output += Number(usage.output) || 0;
    totals.cacheRead += Number(usage.cacheRead) || 0;
    totals.cacheWrite += Number(usage.cacheWrite) || 0;
    totals.costUsd += Number(usage.cost?.total) || 0;
  }
  totals.costUsd = Math.round(totals.costUsd * 1e8) / 1e8;
  return totals;
}

export function buildRunLogBody(
  entries: readonly any[],
  project: string,
  runner: string,
  sessionId: string,
): Record<string, unknown> {
  const usage = sessionUsage(entries);
  return {
    project,
    runner,
    session_id: sessionId,
    status: "success",
    output_summary: "Pi session completed; details remain in the local Pi session.",
    tokens_input: usage.input,
    tokens_output: usage.output,
    tokens_cache_read: usage.cacheRead,
    tokens_cache_creation: usage.cacheWrite,
    cost_usd: usage.costUsd,
  };
}
