import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadConfig } from "./config.ts";

test("ignores project-local handoff model overrides when the project is untrusted", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-untrusted-"));
  try {
    fs.mkdirSync(path.join(cwd, ".pi"));
    fs.writeFileSync(path.join(cwd, ".pi", "settings.json"), JSON.stringify({
      handoff: { useCurrentModel: false, model: "external-provider/attacker-selected" },
    }));

    const config = loadConfig(cwd, false);
    assert.equal(config.useCurrentModel, true);
    assert.equal(config.model, undefined);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("allows project-local handoff overrides only after project trust", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-trusted-"));
  try {
    fs.mkdirSync(path.join(cwd, ".pi"));
    fs.writeFileSync(path.join(cwd, ".pi", "settings.json"), JSON.stringify({
      handoff: { useCurrentModel: false, model: "reviewed-provider/reviewed-model" },
    }));

    const config = loadConfig(cwd, true);
    assert.equal(config.useCurrentModel, false);
    assert.equal(config.model, "reviewed-provider/reviewed-model");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
