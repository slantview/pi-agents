import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBtwAnswer, prepareBtwDisplayText } from "./btw.ts";

test("treats absent RPC custom-UI results as cancellation", () => {
  assert.equal(normalizeBtwAnswer(undefined), null);
  assert.equal(normalizeBtwAnswer(null), null);
  assert.equal(normalizeBtwAnswer("answer"), "answer");
});

test("neutralizes terminal controls in side-question model output", () => {
  const displayed = prepareBtwDisplayText("answer\u0007\u001b]52;c;clipboard\u001b\\\u009b31m\u202Espoof");
  assert.equal(displayed, "answer]52;c;clipboard\\31mspoof");
  assert.doesNotMatch(displayed, /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u);
});
