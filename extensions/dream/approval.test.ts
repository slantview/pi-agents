import assert from "node:assert/strict";
import test from "node:test";

import { DreamApprovalGuard, type DreamWritePlan } from "./approval.ts";

const candidateDigest = "a".repeat(64);
const operation = {
  tool: "zikra_zikra_save_memory" as const,
  args: {
    project: "github-com-example-repo-1234567890",
    title: "Governed Dream approval",
    content_md: "Dream-derived writes are bound to a reviewed plan.",
    memory_type: "decision",
    tags: ["dreaming"],
  },
};
const plan = (operations = [operation]): DreamWritePlan => ({ schemaVersion: 1, candidateDigest, operations });
const approvalInput = (writePlan: DreamWritePlan) => ({
  title: "Approve Dream Report",
  questions: [{
    id: "dream_report_approval",
    label: "Approval",
    type: "preview",
    prompt: "Approve the complete verified Dream write plan?",
    required: true,
    options: [
      { value: "approve", label: "Approve complete report", preview: `Complete plan\n<dream-write-plan-json>${JSON.stringify(writePlan)}</dream-write-plan-json>` },
      { value: "revise", label: "Revise", preview: "No writes. Revise and re-review the complete plan." },
      { value: "reject", label: "Reject", preview: "No durable memory changes will be made." },
    ],
  }],
});

test("Dream writes are blocked before whole-report approval", () => {
  const guard = new DreamApprovalGuard();
  guard.setPendingCandidate(candidateDigest);
  assert.deepEqual(
    guard.checkMcpCall("mcp-1", { tool: operation.tool, args: operation.args }),
    { block: true, reason: "Dream-derived Zikra writes require an approved complete write plan" },
  );
});

test("hyphenated aliases of guarded Zikra mutations are blocked", () => {
  const guard = new DreamApprovalGuard();
  guard.setPendingCandidate(candidateDigest);
  for (const tool of [
    "zikra-zikra-save-memory",
    "zikra-zikra-save-requirement",
    "zikra-zikra-save-prompt",
    "zikra-zikra-log-error",
    "zikra-zikra-log-run",
    "zikra-zikra-promote-requirement",
    "zikra-zikra-delete-memory",
    "zikra-zikra-create-token",
  ]) {
    assert.equal(guard.checkMcpCall(`alias-${tool}`, { tool, args: {} }).block, true);
  }
});

test("approval is bound to exact ordered operations and consumed after success", () => {
  const guard = new DreamApprovalGuard();
  guard.setPendingCandidate(candidateDigest);
  assert.deepEqual(guard.checkAskCall("ask-1", approvalInput(plan())), { block: false });
  assert.equal(guard.recordAskResult("ask-1", {
    cancelled: false,
    answers: { dream_report_approval: { values: ["approve"] } },
  }, false), "approved");

  assert.equal(guard.checkMcpCall("wrong", {
    tool: operation.tool,
    args: { ...operation.args, project: "github-com-attacker-repo-0000000000" },
  }).block, true);
  assert.deepEqual(guard.checkMcpCall("write-1", { tool: operation.tool, args: operation.args }), { block: false });
  assert.equal(guard.recordMcpResult("write-1", {}, false), "completed");
  assert.equal(guard.pendingCandidateDigest, undefined);
  assert.equal(guard.isTerminal(), true);
  assert.equal(guard.checkMcpCall("extra", {
    tool: operation.tool,
    args: { ...operation.args, title: "Unapproved extra memory" },
  }).block, true);
  guard.releaseTerminal();
  assert.deepEqual(
    guard.checkMcpCall("replay", { tool: operation.tool, args: operation.args }),
    { block: true, reason: "A completed Dream operation cannot be replayed" },
  );
});

test("a successful prefix operation cannot be replayed after partial application", () => {
  const second = {
    tool: "zikra_zikra_save_requirement" as const,
    args: {
      project: "github-com-example-repo-1234567890",
      title: "Dream approval acceptance",
      content_md: "Approved Dream plans must be applied sequentially.",
      tags: ["dreaming"],
    },
  };
  const guard = new DreamApprovalGuard();
  guard.setPendingCandidate(candidateDigest);
  guard.checkAskCall("ask-two", approvalInput(plan([operation, second])));
  guard.recordAskResult("ask-two", { cancelled: false, answers: { dream_report_approval: { values: ["approve"] } } }, false);
  assert.equal(guard.checkMcpCall("first", operation).block, false);
  assert.equal(guard.recordMcpResult("first", {}, false), "advanced");
  assert.equal(guard.checkMcpCall("replay-first", operation).block, true);
  assert.equal(guard.checkMcpCall("second", second).block, false);
});

test("adapter denial or ambiguous error invalidates approval before later operations", () => {
  const second = {
    tool: "zikra_zikra_save_requirement" as const,
    args: {
      project: "github-com-example-repo-1234567890",
      title: "Second operation",
      content_md: "This operation must remain blocked after denial.",
      tags: ["dreaming"],
    },
  };
  const guard = new DreamApprovalGuard();
  guard.setPendingCandidate(candidateDigest);
  guard.checkAskCall("ask-denied", approvalInput(plan([operation, second])));
  guard.recordAskResult("ask-denied", { cancelled: false, answers: { dream_report_approval: { values: ["approve"] } } }, false);
  assert.equal(guard.checkMcpCall("denied", operation).block, false);
  assert.equal(guard.recordMcpResult("denied", { error: "approval_denied" }, false), "reconcile");
  assert.equal(guard.checkMcpCall("second-after-denial", second).block, true);
  assert.equal(guard.checkMcpCall("blind-retry", operation).block, true);
});

test("approval rejects a mismatched digest, local path, secret, or extra operation field", () => {
  for (const bad of [
    { ...plan(), candidateDigest: "b".repeat(64) },
    plan([{ ...operation, args: { ...operation.args, content_md: `See /${"Users"}/example/private/file` } }]),
    plan([{ ...operation, args: { ...operation.args, content_md: "See /private/work/file" } }]),
    plan([{ ...operation, args: { ...operation.args, content_md: "root=/private/work/file" } }]),
    plan([{ ...operation, args: { ...operation.args, content_md: "path:C:\\work\\file" } }]),
    plan([{ ...operation, args: { ...operation.args, content_md: "See C:\\work\\file" } }]),
    plan([{ ...operation, args: { ...operation.args, content_md: "See \\\\server\\share\\file" } }]),
    plan([{ ...operation, args: { ...operation.args, content_md: "See ~/private/file" } }]),
    plan([{ ...operation, args: { ...operation.args, content_md: "See file:///private/work/file" } }]),
    plan([{ ...operation, args: { ...operation.args, content_md: "password=not-for-memory" } }]),
    plan([{ ...operation, unexpected: "execute" } as any]),
  ]) {
    const guard = new DreamApprovalGuard();
    guard.setPendingCandidate(candidateDigest);
    assert.equal(guard.checkAskCall("ask-bad", approvalInput(bad as DreamWritePlan)).block, true);
  }
});

test("approval permits web URLs and repository-relative evidence paths", () => {
  const guard = new DreamApprovalGuard();
  guard.setPendingCandidate(candidateDigest);
  const webPlan = plan([{ ...operation, args: {
    ...operation.args,
    content_md: "Verified by https://example.com/spec and docs/adr/0001.md.",
  } }]);
  assert.equal(guard.checkAskCall("ask-web", approvalInput(webPlan)).block, false);
});

test("approval rejects spoofed labels and terminal-controlled visible text", () => {
  for (const mutate of [
    (input: any) => { input.questions[0].options[0].label = "Reject"; },
    (input: any) => { input.questions[0].options[2].label = "Approve complete report"; },
    (input: any) => { input.questions[0].prompt += "\u001b]52;c;bad\u0007"; },
    (input: any) => { input.questions[0].options[1].preview += "\u202e"; },
  ]) {
    const guard = new DreamApprovalGuard();
    guard.setPendingCandidate(candidateDigest);
    const input = approvalInput(plan());
    mutate(input);
    assert.equal(guard.checkAskCall("ask-spoof", input).block, true);
  }
});

test("revision keeps the candidate pending while rejection closes the current agent run", () => {
  const revised = new DreamApprovalGuard();
  revised.setPendingCandidate(candidateDigest);
  revised.checkAskCall("ask-r", approvalInput(plan()));
  assert.equal(revised.recordAskResult("ask-r", { cancelled: false, answers: { dream_report_approval: { values: ["revise"] } } }, false), "revised");
  assert.equal(revised.checkMcpCall("mcp-r", { tool: operation.tool, args: operation.args }).block, true);

  const rejected = new DreamApprovalGuard();
  rejected.setPendingCandidate(candidateDigest);
  rejected.checkAskCall("ask-x", approvalInput(plan()));
  assert.equal(rejected.recordAskResult("ask-x", { cancelled: false, answers: { dream_report_approval: { values: ["reject"] } } }, false), "rejected");
  assert.equal(rejected.pendingCandidateDigest, undefined);
  assert.equal(rejected.isTerminal(), true);
  assert.equal(rejected.checkMcpCall("after-reject", operation).block, true);
});
