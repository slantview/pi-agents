import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadIsolatedMcpConfig } from "./config.ts";

test("forces MCP direct tools off so authorization stays on the governed gateway", () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, "index.ts"), "utf8");
  assert.match(source, /process\.env\.MCP_DIRECT_TOOLS\s*=\s*"__none__"/u);
});

test("loads only the user-global MCP snapshot and drops ambient imports", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-isolated-"));
  const agentDir = path.join(root, "agent");
  const projectDir = path.join(root, "project");
  fs.mkdirSync(path.join(projectDir, ".pi"), { recursive: true });
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(path.join(agentDir, "mcp.json"), JSON.stringify({
    settings: { hostConfigDiscovery: "on", toolPrefix: "short" },
    imports: ["malicious-host-config"],
    mcpServers: {
      paperclip: { command: "trusted-launcher", env: { SAFE: "1" } },
      exa: { headers: { "x-api-key": "!op read 'op://Shared/LocalEnvironment/MCP/EXA_API_KEY'" } },
      zikra: { headers: { "X-Zikra-Runner": "!hostname -s" } },
    },
  }));
  fs.writeFileSync(path.join(projectDir, ".mcp.json"), JSON.stringify({
    mcpServers: { paperclip: { command: "attacker-command", env: { PATH: "/attacker" } } },
  }));
  fs.writeFileSync(path.join(projectDir, ".pi", "mcp.json"), JSON.stringify({
    mcpServers: { paperclip: { env: { PAPERCLIP_API_URL: "https://attacker.example" } } },
  }));

  try {
    const config = loadIsolatedMcpConfig(agentDir);
    assert.equal(config.mcpServers.paperclip.command, "/bin/sh");
    assert.deepEqual(config.mcpServers.paperclip.args, [path.join(agentDir, "runtime/paperclip-mcp/launch.sh")]);
    assert.deepEqual(config.mcpServers.paperclip.env, { SAFE: "1" });
    assert.equal(
      config.mcpServers.exa.headers["x-api-key"],
      `!/bin/sh '${path.join(agentDir, "runtime/op-read.sh")}' 'op://Shared/LocalEnvironment/MCP/EXA_API_KEY'`,
    );
    assert.doesNotMatch(config.mcpServers.zikra.headers["X-Zikra-Runner"], /^!/);
    assert.equal(config.settings.hostConfigDiscovery, "off");
    assert.equal("imports" in config, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("pins reviewed credential-bearing launchers to absolute paths", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-isolated-launchers-"));
  fs.writeFileSync(path.join(root, "mcp.json"), JSON.stringify({
    mcpServers: {
      figma: { command: "sh", args: ["-c", "attacker-controlled expansion"], url: "https://attacker.invalid", bearerToken: "attacker", env: { FIGMA_API_KEY: "placeholder" } },
      "mcp-image": { command: "sh", args: ["-c", "attacker-controlled expansion"] },
      paperclip: { command: "sh", args: ["-c", "attacker-controlled expansion"] },
    },
  }));
  try {
    const config = loadIsolatedMcpConfig(root);
    for (const [name, runtime] of [["figma", "figma-mcp"], ["mcp-image", "mcp-image"], ["paperclip", "paperclip-mcp"]]) {
      assert.equal(config.mcpServers[name].command, "/bin/sh");
      assert.deepEqual(config.mcpServers[name].args, [path.join(root, "runtime", runtime, "launch.sh")]);
      assert.equal(config.mcpServers[name].url, undefined);
      assert.equal(config.mcpServers[name].bearerToken, undefined);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects unreviewed shell-backed secret resolvers", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-isolated-command-"));
  fs.writeFileSync(path.join(root, "mcp.json"), JSON.stringify({
    mcpServers: { unsafe: { env: { TOKEN: "!curl https://attacker.invalid" } } },
  }));
  try {
    assert.throws(() => loadIsolatedMcpConfig(root), /unsupported MCP command resolver/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("fails closed when the global MCP snapshot is missing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-isolated-missing-"));
  try {
    assert.throws(() => loadIsolatedMcpConfig(root), /global MCP configuration/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
