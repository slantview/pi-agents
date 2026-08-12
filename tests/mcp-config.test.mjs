import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { PAPERCLIP_ALLOWED_TOOLS } from "../runtime/paperclip-mcp/policy.mjs";

const root = path.resolve(import.meta.dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "config/mcp.example.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const expectedReadTools = [
  "paperclipListAgents",
  "paperclipGetAgent",
  "paperclipListIssues",
  "paperclipGetIssue",
  "paperclipGetHeartbeatContext",
  "paperclipListComments",
  "paperclipGetComment",
  "paperclipListIssueApprovals",
  "paperclipListDocuments",
  "paperclipGetDocument",
  "paperclipListDocumentRevisions",
  "paperclipListProjects",
  "paperclipGetProject",
  "paperclipGetIssueWorkspaceRuntime",
  "paperclipWaitForIssueWorkspaceService",
  "paperclipListGoals",
  "paperclipGetGoal",
  "paperclipListApprovals",
  "paperclipGetApproval",
  "paperclipGetApprovalIssues",
  "paperclipListApprovalComments",
];

const expectedWriteTools = [
  "paperclipControlIssueWorkspaceServices",
  "paperclipCreateApproval",
  "paperclipCreateIssue",
  "paperclipUpdateIssue",
  "paperclipCheckoutIssue",
  "paperclipReleaseIssue",
  "paperclipAddComment",
  "paperclipSuggestTasks",
  "paperclipAskUserQuestions",
  "paperclipRequestConfirmation",
  "paperclipRequestCheckboxConfirmation",
  "paperclipUpsertIssueDocument",
  "paperclipRestoreIssueDocumentRevision",
  "paperclipLinkIssueApproval",
  "paperclipUnlinkIssueApproval",
  "paperclipApprovalDecision",
  "paperclipAddApprovalComment",
];

test("MCP servers use isolated lockfile-controlled launchers", () => {
  assert.ok(manifest.pi.extensions.includes("./extensions/mcp-isolated/index.ts"));
  assert.ok(!manifest.pi.extensions.includes("./node_modules/pi-mcp-adapter/index.ts"));
  for (const [name, server] of Object.entries(config.mcpServers)) {
    assert.notEqual(server.command, "npx", `${name} must not resolve npm packages at runtime`);
  }

  const paperclip = config.mcpServers.paperclip;
  assert.ok(paperclip);
  assert.equal(paperclip.command, "/bin/sh");
  assert.deepEqual(paperclip.args, [
    "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/runtime/paperclip-mcp/launch.sh",
  ]);
  assert.equal(manifest.devDependencies?.["@paperclipai/mcp-server"], undefined);

  const runtimeManifest = JSON.parse(fs.readFileSync(path.join(root, "runtime/paperclip-mcp/package.json"), "utf8"));
  const runtimeLock = JSON.parse(fs.readFileSync(path.join(root, "runtime/paperclip-mcp/package-lock.json"), "utf8"));
  assert.equal(runtimeManifest.dependencies["@paperclipai/mcp-server"], "2026.722.0");
  assert.equal(runtimeLock.packages[""].dependencies["@paperclipai/mcp-server"], "2026.722.0");
  assert.match(runtimeLock.packages["node_modules/@paperclipai/mcp-server"].integrity, /^sha512-/);
  const launcher = fs.readFileSync(path.join(root, "runtime/paperclip-mcp/launch.sh"), "utf8");
  assert.match(launcher, /op:\/\/Shared\/LocalEnvironment\/MCP\/PAPERCLIP_PI_BOARD_TOKEN/);
  assert.match(launcher, /"\$op_bin" read /);
  assert.match(launcher, /\/usr\/bin\/env -i/);
  assert.doesNotMatch(launcher, /echo .*PAPERCLIP_API_KEY|set -x/);
  assert.equal(paperclip.env, undefined);
  assert.equal(paperclip.exposeResources, false);
  assert.deepEqual([...paperclip.includeTools].sort(), [...expectedReadTools, ...expectedWriteTools].sort());
  assert.deepEqual([...paperclip.includeTools].sort(), [...PAPERCLIP_ALLOWED_TOOLS].sort());
  assert.deepEqual([...paperclip.approveTools].sort(), [...expectedWriteTools].sort());
  assert.ok(!paperclip.includeTools.includes("paperclipApiRequest"));
  assert.doesNotMatch(JSON.stringify(paperclip), /https?:\/\/[^/\s]+\.ts\.net/i);

  assert.deepEqual([...config.mcpServers.zikra.approveTools].sort(), [
    "zikra_create_token",
    "zikra_delete_memory",
    "zikra_log_error",
    "zikra_log_run",
    "zikra_promote_requirement",
    "zikra_save_memory",
    "zikra_save_prompt",
    "zikra_save_requirement",
  ].sort());

  assert.equal(config.mcpServers.figma.env.FIGMA_API_KEY, undefined);
  assert.equal(config.mcpServers["mcp-image"].env.GEMINI_API_KEY, undefined);
  assert.equal(config.mcpServers["mcp-image"].env.IMAGE_INPUT_DIR, "${MCP_IMAGE_INPUT_DIR}");

  const lockedRuntimes = [
    ["figma", "figma-mcp", "figma-developer-mcp", "0.13.2"],
    ["mcp-image", "mcp-image", "mcp-image", "0.12.1"],
  ];
  for (const [serverName, runtimeName, packageName, version] of lockedRuntimes) {
    const server = config.mcpServers[serverName];
    assert.equal(server.command, "/bin/sh");
    assert.match(server.args[0], new RegExp(`runtime/${runtimeName}/launch\\.sh`));
    const runtimeRoot = path.join(root, "runtime", runtimeName);
    const runtimeManifest = JSON.parse(fs.readFileSync(path.join(runtimeRoot, "package.json"), "utf8"));
    const runtimeLock = JSON.parse(fs.readFileSync(path.join(runtimeRoot, "package-lock.json"), "utf8"));
    assert.equal(runtimeManifest.dependencies[packageName], version);
    assert.equal(runtimeLock.packages[""].dependencies[packageName], version);
    assert.match(runtimeLock.packages[`node_modules/${packageName}`].integrity, /^sha512-/);
  }
});
