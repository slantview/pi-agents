import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

for (const runtimeName of ["figma-mcp", "mcp-image"]) {
  test(`${runtimeName} resolves its credential only after entering a clean environment`, () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), `${runtimeName}-launcher-`));
    const runtime = path.join(temp, "runtime");
    const runtimeDir = path.join(runtime, runtimeName);
    const trustedBin = path.join(temp, "trusted-bin");
    const trustedHome = path.join(temp, "trusted-home");
    const outputDir = path.join(temp, "output");
    const inputDir = path.join(temp, "input");
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.mkdirSync(trustedBin);
    fs.mkdirSync(trustedHome);
    fs.mkdirSync(outputDir);
    fs.mkdirSync(inputDir);
    const launcher = path.join(runtimeDir, "launch.sh");
    fs.copyFileSync(path.join(root, "runtime", runtimeName, "launch.sh"), launcher);
    const credential = `${runtimeName}-credential-placeholder`;
    const op = path.join(trustedBin, "op");
    const node = path.join(trustedBin, "node");
    fs.writeFileSync(op, `#!/bin/sh
[ -z "\${NODE_OPTIONS-}" ] || exit 10
[ -z "\${HTTPS_PROXY-}" ] || exit 11
printf '%s\\n' '${credential}'
`, { mode: 0o755 });
    const credentialName = runtimeName === "figma-mcp" ? "FIGMA_API_KEY" : "GEMINI_API_KEY";
    fs.writeFileSync(node, `#!/bin/sh
[ "$(printenv '${credentialName}')" = '${credential}' ] || exit 20
[ -z "\${NODE_OPTIONS-}" ] || exit 21
[ -z "\${HTTPS_PROXY-}" ] || exit 22
printf '${runtimeName}-ok\\n'
`, { mode: 0o755 });
    fs.writeFileSync(path.join(runtime, "node-path"), `${node}\n`);
    fs.writeFileSync(path.join(runtime, "op-path"), `${op}\n`);
    fs.writeFileSync(path.join(runtime, "home-path"), `${trustedHome}\n`);

    try {
      const env = {
        ...process.env,
        HOME: path.join(temp, "attacker-home"),
        PATH: "/attacker:/usr/bin:/bin",
        NODE_OPTIONS: "--require=/attacker/hook.js",
        PI_MCP_CLEAN_STAGE: "1",
        PI_MCP_NODE_BIN: "/bin/false",
        PI_MCP_OP_BIN: "/bin/false",
        HTTPS_PROXY: "http://attacker.invalid",
        FIGMA_API_KEY: "attacker-key",
        GEMINI_API_KEY: "attacker-key",
        IMAGE_DIR: outputDir,
        IMAGE_OUTPUT_DIR: outputDir,
        IMAGE_INPUT_DIR: inputDir,
        IMAGE_QUALITY: "balanced",
      };
      const result = spawnSync("/bin/sh", [launcher], { encoding: "utf8", env });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, `${runtimeName}-ok\n`);
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(credential));
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
}
