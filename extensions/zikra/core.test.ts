import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRunLogBody,
  canonicalRemoteIdentity,
  deriveProjectName,
  normalizeProjectName,
  sessionUsage,
  trustedOpReadInvocation,
} from "./core.ts";

test("native Zikra token resolution uses the trusted absolute resolver", () => {
  assert.deepEqual(
    trustedOpReadInvocation("/trusted/agent", "op://Shared/LocalEnvironment/MCP/ZIKRA_PI_TOKEN"),
    {
      command: "/bin/sh",
      args: ["/trusted/agent/runtime/op-read.sh", "op://Shared/LocalEnvironment/MCP/ZIKRA_PI_TOKEN"],
    },
  );
  assert.throws(() => trustedOpReadInvocation("/trusted/agent", "plaintext"), /1Password reference/i);
});

test("normalizeProjectName produces stable lowercase namespaces", () => {
  assert.equal(normalizeProjectName("Kingpin Security / API"), "kingpin-security-api");
  assert.equal(normalizeProjectName("---"), "main");
  assert.equal(normalizeProjectName("A__B...C"), "a-b-c");
});

test("canonicalRemoteIdentity normalizes reviewed Git remote forms", () => {
  assert.equal(canonicalRemoteIdentity("git@github.com:a3tai/akp.git"), "github.com/a3tai/akp");
  assert.equal(canonicalRemoteIdentity("https://github.com/a3tai/akp.git"), "github.com/a3tai/akp");
  assert.equal(canonicalRemoteIdentity("not a remote"), "");
});

test("deriveProjectName uses readable canonical identity plus a stable digest", () => {
  assert.match(
    deriveProjectName("git@github.com:a3tai/kingpin.git", "/tmp/worktrees/kingpin-fix", "main"),
    /^github-com-a3tai-kingpin-[a-f0-9]{10}$/,
  );
  assert.match(
    deriveProjectName("https://github.com/GetZikra/zikra.git", "/tmp/zikra-worktree", "main"),
    /^github-com-getzikra-zikra-[a-f0-9]{10}$/,
  );
});

test("deriveProjectName keeps equivalent remotes stable and lossy boundaries distinct", () => {
  const ssh = deriveProjectName("git@github.com:a3tai/kingpin.git", "/tmp/a", "main");
  const https = deriveProjectName("https://github.com/a3tai/kingpin.git", "/tmp/b", "main");
  assert.equal(ssh, https);
  assert.notEqual(ssh, deriveProjectName("https://github.com/another/kingpin.git", "/tmp/c", "main"));
  assert.notEqual(
    deriveProjectName("https://github.com/a-b/c.git", "/tmp/d", "main"),
    deriveProjectName("https://github.com/a/b-c.git", "/tmp/e", "main"),
  );
  const prefix = "x".repeat(100);
  assert.notEqual(
    deriveProjectName(`https://github.com/org/${prefix}a.git`, "/tmp/f", "main"),
    deriveProjectName(`https://github.com/org/${prefix}b.git`, "/tmp/g", "main"),
  );
});

test("deriveProjectName isolates no-remote Git roots then uses configured default", () => {
  assert.match(deriveProjectName("", "/work/My Project", "main"), /^my-project-[a-f0-9]{10}$/);
  assert.notEqual(
    deriveProjectName("", "/work-one/Same Name", "main"),
    deriveProjectName("", "/work-two/Same Name", "main"),
  );
  assert.equal(deriveProjectName("", "", "fallback"), "fallback");
});

test("sessionUsage totals assistant and nested tool usage", () => {
  const entries = [
    {
      type: "message",
      message: {
        role: "assistant",
        usage: { input: 10, output: 4, cacheRead: 3, cacheWrite: 2, cost: { total: 0.1 } },
      },
    },
    {
      type: "message",
      message: {
        role: "toolResult",
        usage: { input: 2, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: 0.02 } },
      },
    },
  ];

  assert.deepEqual(sessionUsage(entries), {
    input: 12,
    output: 5,
    cacheRead: 3,
    cacheWrite: 2,
    costUsd: 0.12,
  });
});

test("buildRunLogBody records metadata without session content", () => {
  const entries = [
    {
      type: "message",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "credential-shaped canary must not persist" }],
        usage: { input: 10, output: 4, cacheRead: 3, cacheWrite: 2, cost: { total: 0.1 } },
      },
    },
  ];

  const body = buildRunLogBody(entries, "github-com-a3tai-kingpin-deadbeef00", "pi@host", "session-id");
  assert.equal(body.output_summary, "Pi session completed; details remain in the local Pi session.");
  assert.equal(body.tokens_input, 10);
  assert.equal(body.tokens_output, 4);
  assert.equal(JSON.stringify(body).includes("credential-shaped canary"), false);
});
