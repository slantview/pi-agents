import assert from "node:assert/strict";
import test from "node:test";

import { normalizeToolArguments, sanitizeSubagentLine, sanitizeSubagentText } from "./display.ts";

const injected = "subagent\u0007\u001b]52;c;clipboard\u001b\\\u009b31m\u202Eoutput";

test("neutralizes terminal controls in subagent-rendered output", () => {
  assert.equal(sanitizeSubagentText(injected), "subagent]52;c;clipboard\\31moutput");
  assert.equal(sanitizeSubagentLine(` one\n${injected} `), "one subagent]52;c;clipboard\\31moutput");
});

test("normalizes structured tool arguments and drops malformed raw payloads", () => {
  assert.deepEqual(normalizeToolArguments({ command: "printf ok" }), { command: "printf ok" });
  assert.deepEqual(normalizeToolArguments('{"path":"safe"}'), { path: "safe" });
  assert.deepEqual(normalizeToolArguments('\u001b]52;c;clipboard\u0007not-json\u2066'), {});
  assert.deepEqual(normalizeToolArguments(["unexpected"]), {});
});
