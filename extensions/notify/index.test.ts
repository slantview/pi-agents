import assert from "node:assert/strict";
import test from "node:test";

import { canSendTerminalNotification, sanitizeNotificationText } from "./index.ts";

test("sanitizes terminal control sequences and OSC field delimiters", () => {
  const input = "hello\u0007\u001b]9;injected\u001b\\;world\u009b31m\u202Etxt";
  const sanitized = sanitizeNotificationText(input);

  assert.equal(sanitized, "hello]9,injected\\,world31mtxt");
  assert.doesNotMatch(sanitized, /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069;]/u);
});

test("collapses whitespace and bounds notification length", () => {
  assert.equal(sanitizeNotificationText("  one\n\ttwo  "), "one two");
  assert.equal(sanitizeNotificationText("x".repeat(400)).length, 240);
});

test("uses a safe fallback when sanitization removes all content", () => {
  assert.equal(sanitizeNotificationText("\u0007\u001b\u202E"), "Notification");
});

test("never writes OSC notifications to non-TTY output", () => {
  assert.equal(canSendTerminalNotification(false), false);
});
