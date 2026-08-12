import assert from "node:assert/strict";
import test from "node:test";

import { parseAgentDefinition } from "./agents.ts";

test("parseAgentDefinition accepts bounded lean review execution metadata", () => {
  const agent = parseAgentDefinition(
    "/agents/reviewer.md",
    "user",
    `---
name: reviewer
description: Reviews changed behavior
tools: read, grep
execution: lean-review
includeGitDiff: true
timeoutMs: 120000
---
Review only changed behavior.
`,
  );

  assert.equal(agent?.executionProfile, "lean-review");
  assert.equal(agent?.includeGitDiff, true);
  assert.equal(agent?.timeoutMs, 120_000);
});

test("parseAgentDefinition rejects invalid or excessive execution limits", () => {
  for (const timeoutMs of ["invalid", "999", "900001"]) {
    assert.throws(
      () => parseAgentDefinition(
        "/agents/reviewer.md",
        "user",
        `---
name: reviewer
description: Reviews changes
timeoutMs: ${timeoutMs}
---
Prompt
`,
      ),
      /timeoutMs/i,
    );
  }
});
