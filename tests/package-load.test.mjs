import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";

const root = path.resolve(import.meta.dirname, "..");

test("Pi loads every packaged extension and skill without diagnostics", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agents-package-"));
  try {
    fs.mkdirSync(temp, { recursive: true });
    fs.writeFileSync(path.join(temp, "settings.json"), JSON.stringify({ packages: [root] }));
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
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
