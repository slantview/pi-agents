import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";

const root = path.resolve(import.meta.dirname, "..");

test("Pi loads every packaged extension and skill without diagnostics", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agents-package-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  try {
    fs.mkdirSync(temp, { recursive: true });
    fs.copyFileSync(path.join(root, "config", "mcp.example.json"), path.join(temp, "mcp.json"));
    fs.writeFileSync(path.join(temp, "settings.json"), JSON.stringify({ packages: [root] }));
    process.env.PI_CODING_AGENT_DIR = temp;
    const settingsManager = SettingsManager.create(root, temp);
    const loader = new DefaultResourceLoader({ cwd: root, agentDir: temp, settingsManager });
    await loader.reload();

    const extensionResult = loader.getExtensions();
    assert.deepEqual(extensionResult.errors, []);
    assert.equal(extensionResult.extensions.length, 13);

    const skillResult = loader.getSkills();
    assert.deepEqual(skillResult.diagnostics.filter((entry) => entry.type === "error"), []);
    assert.equal(skillResult.skills.length, 10);
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
