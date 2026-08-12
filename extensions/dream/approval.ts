import { createHash } from "node:crypto";
import { Type } from "typebox";
import * as Value from "typebox/value";

import { sanitizeTerminalText } from "../shared/terminal-text.ts";
import { redactSensitiveText } from "./redaction.ts";

const ProjectSchema = Type.String({ pattern: "^[a-z0-9][a-z0-9-]{0,99}$" });
const TagsSchema = Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 40 }), { maxItems: 8 }));
const SaveMemoryArgsSchema = Type.Object({
  project: ProjectSchema,
  title: Type.String({ minLength: 4, maxLength: 120 }),
  content_md: Type.String({ minLength: 8, maxLength: 4_000 }),
  memory_type: Type.Union([Type.Literal("decision"), Type.Literal("architecture"), Type.Literal("error"), Type.Literal("note")]),
  tags: TagsSchema,
  module: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  resolution: Type.Optional(Type.String({ minLength: 1, maxLength: 1_000 })),
  created_by: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
}, { additionalProperties: false });
const SaveRequirementArgsSchema = Type.Object({
  project: ProjectSchema,
  title: Type.String({ minLength: 4, maxLength: 120 }),
  content_md: Type.String({ minLength: 8, maxLength: 4_000 }),
  tags: TagsSchema,
}, { additionalProperties: false });
const SavePromptArgsSchema = Type.Object({
  project: ProjectSchema,
  title: Type.String({ minLength: 4, maxLength: 120 }),
  content_md: Type.String({ minLength: 8, maxLength: 4_000 }),
  tags: TagsSchema,
  created_by: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
}, { additionalProperties: false });

const OperationSchema = Type.Union([
  Type.Object({ tool: Type.Literal("zikra_zikra_save_memory"), args: SaveMemoryArgsSchema }, { additionalProperties: false }),
  Type.Object({ tool: Type.Literal("zikra_zikra_save_requirement"), args: SaveRequirementArgsSchema }, { additionalProperties: false }),
  Type.Object({ tool: Type.Literal("zikra_zikra_save_prompt"), args: SavePromptArgsSchema }, { additionalProperties: false }),
]);
const PlanSchema = Type.Object({
  schemaVersion: Type.Literal(1),
  candidateDigest: Type.String({ pattern: "^[a-f0-9]{64}$" }),
  operations: Type.Array(OperationSchema, { minItems: 1, maxItems: 20 }),
}, { additionalProperties: false });

export type DreamWriteOperation =
  | { tool: "zikra_zikra_save_memory"; args: Record<string, unknown> }
  | { tool: "zikra_zikra_save_requirement"; args: Record<string, unknown> }
  | { tool: "zikra_zikra_save_prompt"; args: Record<string, unknown> };
export interface DreamWritePlan {
  schemaVersion: 1;
  candidateDigest: string;
  operations: DreamWriteOperation[];
}

const MUTATION_TOOLS = new Set([
  "zikra_zikra_save_memory",
  "zikra_zikra_save_requirement",
  "zikra_zikra_save_prompt",
  "zikra_zikra_log_error",
  "zikra_zikra_log_run",
  "zikra_zikra_promote_requirement",
  "zikra_zikra_delete_memory",
  "zikra_zikra_create_token",
]);

const canonicalJson = (value: unknown): string => {
  const normalize = (item: any): any => {
    if (Array.isArray(item)) return item.map(normalize);
    if (!item || typeof item !== "object") return item;
    return Object.fromEntries(Object.keys(item).sort().map((key) => [key, normalize(item[key])]));
  };
  return JSON.stringify(normalize(value));
};

const planDigest = (plan: DreamWritePlan): string => createHash("sha256").update(canonicalJson(plan)).digest("hex");
const localPathPattern = /(?:file:\/\/|(?:^|[^A-Za-z0-9])(?:\/(?!\/)[A-Za-z0-9._~-]+(?:\/[^\s"'`)]*)?|~\/[^\s"'`)]+|[A-Za-z]:[\\/][^\s"'`)]+|\\\\[^\s"'`)]+))/u;
const containsLocalPath = (value: string): boolean =>
  localPathPattern.test(value.replace(/\bhttps?:\/\/[^\s"'`]+/giu, "[WEB_URL]"));

function parsePlan(preview: string, candidateDigest: string): DreamWritePlan | undefined {
  const start = "<dream-write-plan-json>";
  const end = "</dream-write-plan-json>";
  const first = preview.indexOf(start);
  const last = preview.indexOf(end);
  if (first === -1 || last === -1 || first !== preview.lastIndexOf(start) || last !== preview.lastIndexOf(end) || last <= first) return undefined;
  const json = preview.slice(first + start.length, last).trim();
  if (!json || Buffer.byteLength(json) > 65_536) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (!Value.Check(PlanSchema, parsed)) return undefined;
  const plan = parsed as DreamWritePlan;
  if (plan.candidateDigest !== candidateDigest) return undefined;
  const containsUnsafeString = (value: unknown): boolean => {
    if (typeof value === "string") return containsLocalPath(value) || redactSensitiveText(value).redactions > 0;
    if (Array.isArray(value)) return value.some(containsUnsafeString);
    if (value && typeof value === "object") return Object.values(value).some(containsUnsafeString);
    return false;
  };
  if (containsUnsafeString(plan)) return undefined;
  return plan;
}

export interface GuardDecision {
  block: boolean;
  reason?: string;
}

const allowed = (): GuardDecision => ({ block: false });
const blocked = (reason: string): GuardDecision => ({ block: true, reason });

export class DreamApprovalGuard {
  pendingCandidateDigest: string | undefined;
  approvedPlanDigest: string | undefined;
  private terminal = false;
  private approvedOperations: DreamWriteOperation[] = [];
  private completedOperationDigests = new Set<string>();
  private askPlans = new Map<string, DreamWritePlan>();
  private inFlight = new Map<string, DreamWriteOperation>();

  setPendingCandidate(digest: string): void {
    if (!/^[a-f0-9]{64}$/u.test(digest)) throw new Error("Dream candidate digest is invalid");
    this.pendingCandidateDigest = digest;
    this.approvedPlanDigest = undefined;
    this.terminal = false;
    this.approvedOperations = [];
    this.askPlans.clear();
    this.inFlight.clear();
  }

  clear(): void {
    this.pendingCandidateDigest = undefined;
    this.approvedPlanDigest = undefined;
    this.terminal = false;
    this.approvedOperations = [];
    this.askPlans.clear();
    this.inFlight.clear();
  }

  private enterTerminal(): void {
    this.clear();
    this.terminal = true;
  }

  isTerminal(): boolean {
    return this.terminal;
  }

  releaseTerminal(): void {
    this.terminal = false;
  }

  restoreTerminal(): void {
    this.clear();
    this.terminal = true;
  }

  resetAll(): void {
    this.clear();
    this.completedOperationDigests.clear();
  }

  checkAskCall(toolCallId: string, input: any): GuardDecision {
    if (!this.pendingCandidateDigest) return allowed();
    const questions = Array.isArray(input?.questions) ? input.questions : [];
    const dreamQuestions = questions.filter((question: any) => question?.id === "dream_report_approval");
    if (dreamQuestions.length === 0) return allowed();
    if (input?.title !== "Approve Dream Report" || questions.length !== 1 || dreamQuestions.length !== 1) {
      return blocked("Dream approval must use the canonical complete-report question");
    }
    const question = dreamQuestions[0];
    if (
      question.type !== "preview" ||
      question.label !== "Approval" ||
      question.prompt !== "Approve the complete verified Dream write plan?" ||
      question.required !== true ||
      Object.keys(question).some((key) => !["id", "label", "prompt", "type", "required", "options"].includes(key))
    ) return blocked("Dream approval question text or shape is not canonical");
    const options = Array.isArray(question.options) ? question.options : [];
    const expectedOptions = [
      ["approve", "Approve complete report"],
      ["revise", "Revise"],
      ["reject", "Reject"],
    ];
    if (
      options.length !== 3 ||
      options.some((option: any, index: number) =>
        option?.value !== expectedOptions[index]![0] ||
        option?.label !== expectedOptions[index]![1] ||
        typeof option?.preview !== "string" ||
        Object.keys(option).some((key) => !["value", "label", "preview"].includes(key)))
    ) return blocked("Dream approval option labels, values, and shape must be canonical");
    if (
      options[1].preview !== "No writes. Revise and re-review the complete plan." ||
      options[2].preview !== "No durable memory changes will be made."
    ) return blocked("Dream revise and reject previews must be canonical");
    const visibleStrings = [input.title, question.label, question.prompt, ...options.flatMap((option: any) => [option.label, option.preview])];
    if (visibleStrings.some((value) => sanitizeTerminalText(value) !== value)) {
      return blocked("Dream approval UI contains unsafe terminal text");
    }
    const approve = options[0];
    const plan = parsePlan(approve.preview, this.pendingCandidateDigest);
    if (!plan) return blocked("Dream write plan is malformed, sensitive, or not bound to the candidate report");
    this.askPlans.set(toolCallId, plan);
    return allowed();
  }

  recordAskResult(toolCallId: string, details: any, isError: boolean): "approved" | "revised" | "rejected" | "ignored" {
    const plan = this.askPlans.get(toolCallId);
    this.askPlans.delete(toolCallId);
    if (!plan || isError || details?.cancelled || details?.mode === "elaborate") return "ignored";
    const values = details?.answers?.dream_report_approval?.values;
    if (!Array.isArray(values) || values.length !== 1) return "ignored";
    if (values[0] === "approve") {
      this.approvedOperations = structuredClone(plan.operations);
      this.approvedPlanDigest = planDigest(plan);
      return "approved";
    }
    if (values[0] === "revise") {
      this.approvedOperations = [];
      this.approvedPlanDigest = undefined;
      return "revised";
    }
    if (values[0] === "reject") {
      this.enterTerminal();
      return "rejected";
    }
    return "ignored";
  }

  checkMcpCall(toolCallId: string, input: any): GuardDecision {
    const tool = typeof input?.tool === "string" ? input.tool : "";
    const normalizedTool = tool.replaceAll("-", "_");
    if (!MUTATION_TOOLS.has(normalizedTool)) return allowed();
    if (tool !== normalizedTool) return blocked("Dream Zikra mutations must use canonical tool names");
    if (this.terminal) return blocked("Dream authorization is closed for the remainder of this agent run");
    const actual = { tool, args: input?.args };
    const operationDigest = createHash("sha256").update(canonicalJson(actual)).digest("hex");
    if (this.completedOperationDigests.has(operationDigest)) {
      return blocked("A completed Dream operation cannot be replayed");
    }
    if (!this.pendingCandidateDigest) return allowed();
    if (this.approvedOperations.length === 0) {
      return blocked("Dream-derived Zikra writes require an approved complete write plan");
    }
    if (this.inFlight.size > 0) return blocked("Dream write operations must run sequentially");
    const expected = this.approvedOperations[0]!;
    if (canonicalJson(actual) !== canonicalJson(expected)) {
      return blocked("Zikra mutation does not match the next approved Dream operation");
    }
    this.inFlight.set(toolCallId, expected);
    return allowed();
  }

  recordMcpResult(
    toolCallId: string,
    details: any,
    isError: boolean,
  ): "completed" | "advanced" | "reconcile" | "ignored" {
    const operation = this.inFlight.get(toolCallId);
    this.inFlight.delete(toolCallId);
    if (!operation) return "ignored";
    if (isError || (details && typeof details === "object" && typeof details.error === "string")) {
      this.approvedOperations = [];
      this.approvedPlanDigest = undefined;
      return "reconcile";
    }
    if (canonicalJson(operation) !== canonicalJson(this.approvedOperations[0])) {
      this.clear();
      return "ignored";
    }
    this.approvedOperations.shift();
    this.completedOperationDigests.add(createHash("sha256").update(canonicalJson(operation)).digest("hex"));
    if (this.approvedOperations.length === 0) {
      this.enterTerminal();
      return "completed";
    }
    return "advanced";
  }

  getCompletedOperationDigests(): string[] {
    return [...this.completedOperationDigests].slice(-100);
  }

  restoreCompletedOperationDigests(digests: unknown): void {
    if (!Array.isArray(digests)) return;
    for (const digest of digests.slice(-100)) {
      if (typeof digest === "string" && /^[a-f0-9]{64}$/u.test(digest)) this.completedOperationDigests.add(digest);
    }
  }
}
