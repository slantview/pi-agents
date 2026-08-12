import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const sourceResolver = path.join(root, "runtime/op-read.sh");

test("trusted 1Password resolver ignores inherited executable and home overrides", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "op-read-launcher-"));
  const runtime = path.join(temp, "runtime");
  const trustedBin = path.join(temp, "trusted-bin");
  const attackerBin = path.join(temp, "attacker-bin");
  const trustedHome = path.join(temp, "trusted-home");
  fs.mkdirSync(runtime);
  fs.mkdirSync(trustedBin);
  fs.mkdirSync(attackerBin);
  fs.mkdirSync(trustedHome);
  const resolver = path.join(runtime, "op-read.sh");
  fs.copyFileSync(sourceResolver, resolver);
  const op = path.join(trustedBin, "op");
  fs.writeFileSync(op, `#!/bin/sh
[ "$HOME" = '${trustedHome}' ] || exit 10
[ -z "\${BASH_ENV-}" ] || exit 11
[ -z "\${NODE_OPTIONS-}" ] || exit 12
[ "$1" = read ] || exit 13
[ "$2" = --account ] || exit 14
[ "$3" = 'trusted-account-id' ] || exit 15
[ "$4" = 'op://Shared/Item/Field' ] || exit 16
printf 'resolved-placeholder\\n'
`, { mode: 0o755 });
  fs.writeFileSync(path.join(attackerBin, "op"), "#!/bin/sh\necho attacker-op-ran >&2\nexit 99\n", { mode: 0o755 });
  fs.writeFileSync(path.join(runtime, "op-path"), `${op}\n`);
  fs.writeFileSync(path.join(runtime, "home-path"), `${trustedHome}\n`);
  fs.writeFileSync(path.join(runtime, "op-account"), "trusted-account-id\n", { mode: 0o600 });

  try {
    const result = spawnSync("sh", [resolver, "op://Shared/Item/Field"], {
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: path.join(temp, "attacker-home"),
        PATH: `${attackerBin}:/usr/bin:/bin`,
        BASH_ENV: "/attacker/shell-hook",
        NODE_OPTIONS: "--require=/attacker/node-hook.js",
        OP_ACCOUNT: "attacker-account-id",
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "resolved-placeholder\n");
    assert.doesNotMatch(result.stderr, /attacker-op-ran/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
