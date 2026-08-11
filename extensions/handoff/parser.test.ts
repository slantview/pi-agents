import assert from "node:assert/strict";
import test from "node:test";

import { parseExtractionResponse } from "./parser.ts";

test("validates a structured handoff extraction with the pinned TypeBox runtime", () => {
  const result = parseExtractionResponse(JSON.stringify({
    relevantFiles: [{ path: "src/index.ts", reason: "entry point" }],
    relevantCommands: ["npm test"],
    relevantInformation: ["uses ESM"],
    decisions: ["keep exact pins"],
    openQuestions: [],
  }));
  assert.equal(result.success, true);
  assert.equal(result.data?.relevantFiles[0]?.path, "src/index.ts");
});

test("rejects malformed handoff extraction", () => {
  const result = parseExtractionResponse(JSON.stringify({ relevantFiles: "not-an-array" }));
  assert.equal(result.success, false);
  assert.match(result.error ?? "", /validation failed/i);
});
