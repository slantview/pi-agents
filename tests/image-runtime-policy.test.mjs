import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { assertContainedImagePath } from "../runtime/mcp-image/policy.mjs";

test("image edits are confined to the explicit real input root", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-image-policy-"));
  const root = path.join(parent, "allowed");
  const outside = path.join(parent, "outside.png");
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, "inside.png"), "placeholder");
  fs.writeFileSync(outside, "placeholder");
  fs.symlinkSync(outside, path.join(root, "escape.png"));
  try {
    assert.equal(assertContainedImagePath(root, path.join(root, "inside.png")), fs.realpathSync(path.join(root, "inside.png")));
    assert.throws(() => assertContainedImagePath(root, outside), /outside the configured image input root/i);
    assert.throws(() => assertContainedImagePath(root, path.join(root, "escape.png")), /outside the configured image input root/i);
    assert.throws(() => assertContainedImagePath("", path.join(root, "inside.png")), /disabled/i);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
