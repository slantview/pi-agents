import assert from "node:assert/strict";
import test from "node:test";

import { buildSessionDescription, buildSessionLabel, buildSessionPreview } from "./sessions.ts";

const controls = "\u0007\u001b]9;notify\u001b\\\u009b31m\u202E";
const session = {
  id: "session-123",
  name: `name${controls}`,
  cwd: `/tmp/work${controls}`,
  modified: new Date("2026-01-02T03:04:00Z"),
  firstMessage: `first${controls}`,
  path: "/tmp/session.jsonl",
};

test("neutralizes terminal controls in session labels and descriptions", () => {
  assert.doesNotMatch(buildSessionLabel(session), /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u);
  assert.doesNotMatch(buildSessionDescription(session), /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u);
});

test("neutralizes controls across preview message roles", () => {
  const preview = buildSessionPreview(session, [
    { role: "user", content: `user${controls}` },
    { role: "assistant", content: `assistant${controls}` },
    { role: "toolResult", toolName: `tool${controls}`, content: `output${controls}` },
    { role: "bashExecution", command: `cmd${controls}`, output: `stdout${controls}` },
    { role: "custom", summary: `summary${controls}` },
  ]);
  const strings: string[] = [];
  const collect = (value: unknown): void => {
    if (typeof value === "string") strings.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  };
  collect(preview);
  for (const value of strings) {
    assert.doesNotMatch(value, /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u);
  }
});
