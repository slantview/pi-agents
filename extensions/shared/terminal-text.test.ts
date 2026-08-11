import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeTerminalLine, sanitizeTerminalText } from "./terminal-text.ts";

const injected = "safe\u0007\u001b]52;c;clipboard\u001b\\\u009b31m\u061c\u200f\u202e\u2066spoof";

test("removes terminal control and bidi sequences from untrusted text", () => {
  const sanitized = sanitizeTerminalText(injected);
  assert.equal(sanitized, "safe]52;c;clipboard\\31mspoof");
  assert.doesNotMatch(sanitized, /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u206f]/u);
});

test("preserves line structure for previews but produces safe one-line labels", () => {
  assert.equal(sanitizeTerminalText("one\r\ntwo\tthree"), "one\ntwo three");
  assert.equal(sanitizeTerminalLine(" one\n two\tthree "), "one two three");
});
