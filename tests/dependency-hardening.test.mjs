import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const unsafe = "safe\u0007\u001b]52;c;clipboard\u001b\\\u009b31m\u061c\u200f\u202e\u2066text";
const terminalControls = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u206f]/u;

async function withPatchedAdapterModules(run) {
  const probe = fs.mkdtempSync(path.join(root, ".dependency-hardening-probe-"));
  try {
    for (const file of ["mcp-output-guard", "tool-result-renderer"]) {
      const source = fs.readFileSync(path.join(root, "node_modules/pi-mcp-adapter", `${file}.ts`), "utf8");
      fs.writeFileSync(path.join(probe, `${file}.mjs`), stripTypeScriptTypes(source, { mode: "transform" }));
    }
    const guard = await import(`${pathToFileURL(path.join(probe, "mcp-output-guard.mjs")).href}?probe=${Date.now()}`);
    const renderer = await import(`${pathToFileURL(path.join(probe, "tool-result-renderer.mjs")).href}?probe=${Date.now()}`);
    await run({ guard, renderer });
  } finally {
    fs.rmSync(probe, { recursive: true, force: true });
  }
}

test("patched MCP administrative metadata and app UI paths sanitize terminal text", () => {
  const commands = fs.readFileSync(path.join(root, "node_modules/pi-mcp-adapter/commands.ts"), "utf8");
  const uiSession = fs.readFileSync(path.join(root, "node_modules/pi-mcp-adapter/ui-session.ts"), "utf8");
  const utils = fs.readFileSync(path.join(root, "node_modules/pi-mcp-adapter/utils.ts"), "utf8");
  assert.match(commands, /PI_AGENTS_MCP_METADATA_HARDENING/);
  assert.match(commands, /sanitizeTerminalText\(prompt\.description\)/);
  assert.match(commands, /sanitizeTerminalText\(t\)/);
  assert.match(uiSession, /PI_AGENTS_MCP_UI_NOTIFICATION_HARDENING/);
  assert.match(uiSession, /const safeIntent = sanitizeTerminalText\(intent\)/);
  assert.match(utils, /PI_AGENTS_METADATA_TERMINAL_HARDENING/);
  assert.match(utils, /\\u061c.*\\u206f/);
});

test("patched MCP renderer neutralizes controls in calls and results", async () => {
  await withPatchedAdapterModules(async ({ renderer }) => {
    const callText = renderer.renderMcpProxyToolCall({ tool: unsafe, args: { value: unsafe } }).render(400).join("\n");
    const collapsed = renderer.formatMcpToolResultLines({ content: [{ type: "text", text: unsafe }] }, false).lines.join("\n");
    const expanded = renderer.formatMcpToolResultLines({ content: [{ type: "text", text: unsafe }] }, true).lines.join("\n");
    assert.doesNotMatch(callText, terminalControls);
    assert.doesNotMatch(collapsed, terminalControls);
    assert.doesNotMatch(expanded, terminalControls);
  });
});

test("patched MCP output guard truncates without retaining full artifacts", async () => {
  await withPatchedAdapterModules(async ({ guard }) => {
    const result = await guard.guardMcpOutput([{ type: "text", text: "sensitive-canary".repeat(100) }], {
      maxBytes: 100,
      maxLines: 5,
      detailsMaxBytes: 50,
      rawMcpResult: { payload: "raw-canary".repeat(100) },
    });
    assert.equal(result.outputGuard?.fullOutputPath, undefined);
    assert.match(result.outputGuard?.writeError ?? "", /persistence is disabled/i);
    assert.equal(result.mcpResult && typeof result.mcpResult === "object" && "artifactPath" in result.mcpResult ? result.mcpResult.artifactPath : undefined, undefined);
  });
});
