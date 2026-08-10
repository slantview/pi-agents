import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { assertProjectAgentAccess, resolveContainedCwd } from "./security.ts";

test("resolveContainedCwd accepts the repository and real subdirectories", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-cwd-"));
  try {
    fs.mkdirSync(path.join(root, "src"));
    assert.equal(resolveContainedCwd(root), fs.realpathSync(root));
    assert.equal(resolveContainedCwd(root, "src"), fs.realpathSync(path.join(root, "src")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("project agents require trust and interactive approval", () => {
  assert.doesNotThrow(() => assertProjectAgentAccess(false, false, false));
  assert.doesNotThrow(() => assertProjectAgentAccess(true, true, true));
  assert.throws(() => assertProjectAgentAccess(true, false, true), /project-trust/i);
  assert.throws(() => assertProjectAgentAccess(true, true, false), /interactive/i);
});

test("resolveContainedCwd rejects parent, sibling, absolute, symlink, and missing escapes", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-cwd-parent-"));
  const root = path.join(parent, "repo");
  const sibling = path.join(parent, "sibling");
  fs.mkdirSync(root);
  fs.mkdirSync(sibling);
  fs.symlinkSync(sibling, path.join(root, "escape"));
  try {
    for (const candidate of ["..", sibling, "/", "escape", "missing"]) {
      assert.throws(() => resolveContainedCwd(root, candidate), /working directory/i);
    }
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
