import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const sourceLauncher = path.join(root, "runtime/paperclip-mcp/launch.sh");

test("Paperclip launcher binds trusted paths/config and strips inherited process hooks", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-launcher-"));
  const runtime = path.join(temp, "runtime");
  const runtimeDir = path.join(runtime, "paperclip-mcp");
  const trustedBin = path.join(temp, "trusted-bin");
  const attackerBin = path.join(temp, "attacker-bin");
  const trustedHome = path.join(temp, "trusted-home");
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.mkdirSync(trustedBin);
  fs.mkdirSync(attackerBin);
  fs.mkdirSync(trustedHome);
  const launcher = path.join(runtimeDir, "launch.sh");
  const token = "launcher-test-placeholder";
  const company = "00000000-0000-0000-0000-000000000000";
  fs.copyFileSync(sourceLauncher, launcher);

  const op = path.join(trustedBin, "op");
  const node = path.join(trustedBin, "node");
  fs.writeFileSync(op, `#!/bin/sh
[ "$HOME" = '${trustedHome}' ] || exit 10
[ -z "\${NODE_OPTIONS-}" ] || exit 11
case "$2" in
  *PAPERCLIP_API_URL) printf '%s\\n' 'https://paperclip.example.com' ;;
  *PAPERCLIP_COMPANY_ID) printf '%s\\n' '${company}' ;;
  *PAPERCLIP_PI_BOARD_TOKEN) printf '%s\\n' '${token}' ;;
  *) exit 12 ;;
esac
`, { mode: 0o755 });
  fs.writeFileSync(node, `#!/bin/sh
[ "$HOME" = '${trustedHome}' ] || exit 20
[ "$PAPERCLIP_API_URL" = 'https://paperclip.example.com' ] || exit 21
[ "$PAPERCLIP_COMPANY_ID" = '${company}' ] || exit 22
[ "$PAPERCLIP_API_KEY" = '${token}' ] || exit 23
[ -z "\${NODE_OPTIONS-}" ] || exit 24
[ -z "\${NODE_EXTRA_CA_CERTS-}" ] || exit 25
[ -z "\${HTTPS_PROXY-}" ] || exit 26
printf 'launcher-ok\\n'
`, { mode: 0o755 });
  fs.writeFileSync(path.join(attackerBin, "op"), "#!/bin/sh\necho attacker-op-ran >&2\nexit 99\n", { mode: 0o755 });
  fs.writeFileSync(path.join(runtime, "node-path"), `${node}\n`);
  fs.writeFileSync(path.join(runtime, "op-path"), `${op}\n`);
  fs.writeFileSync(path.join(runtime, "home-path"), `${trustedHome}\n`);

  try {
    const result = spawnSync("sh", [launcher], {
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: path.join(temp, "attacker-home"),
        PATH: `${attackerBin}:/usr/bin:/bin`,
        NODE_OPTIONS: "--require=/attacker/hook.js",
        PI_MCP_CLEAN_STAGE: "1",
        PI_MCP_NODE_BIN: "/bin/false",
        PI_MCP_OP_BIN: "/bin/false",
        NODE_EXTRA_CA_CERTS: "/attacker/ca.pem",
        HTTPS_PROXY: "http://attacker.invalid:8080",
        PAPERCLIP_API_URL: "https://attacker.invalid",
        PAPERCLIP_COMPANY_ID: "attacker-company",
        PAPERCLIP_API_KEY: "attacker-key",
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "launcher-ok\n");
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(token));
    assert.doesNotMatch(result.stderr, /attacker-op-ran/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
