#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export HOME="$TMP/home"
export PI_CODING_AGENT_DIR="$HOME/.pi/agent"
mkdir -p "$HOME/bin" "$PI_CODING_AGENT_DIR"

fail() { echo "FAIL: $*" >&2; exit 1; }
assert_file() { [[ -f "$1" ]] || fail "missing file: $1"; }
assert_contains() { grep -Fq "$2" "$1" || fail "$1 does not contain expected text"; }

# Package installation is tested separately; this exercises safe file deployment.
"$ROOT/install.sh" --skip-packages

assert_file "$PI_CODING_AGENT_DIR/AGENTS.md"
assert_file "$PI_CODING_AGENT_DIR/agents/zikra-memory-curator.md"
assert_file "$PI_CODING_AGENT_DIR/extensions/pi-permission-system/config.json"
assert_file "$PI_CODING_AGENT_DIR/extensions/eko24ive-pi-ask.json"
assert_file "$PI_CODING_AGENT_DIR/mcp.json"
assert_contains "$PI_CODING_AGENT_DIR/mcp.json" "op://"

# The JavaScript snippet is intentionally single-quoted so Bash does not expand template literals.
# shellcheck disable=SC2016
node -e '
const fs = require("fs");
const root = process.env.PI_CODING_AGENT_DIR;
const permission = JSON.parse(fs.readFileSync(`${root}/extensions/pi-permission-system/config.json`, "utf8"));
if (permission.yoloMode !== false) throw new Error("safe profile must disable yoloMode");
const mcp = JSON.parse(fs.readFileSync(`${root}/mcp.json`, "utf8"));
const text = JSON.stringify(mcp);
if (/\/Users\//.test(text) || /\/home\/[A-Za-z0-9_-]+\//.test(text)) throw new Error("machine-specific path in MCP config");
for (const [name, server] of Object.entries(mcp.mcpServers)) {
  const serialized = JSON.stringify(server);
  if (/(api.?key|token|secret)/i.test(serialized) && !/(op:\/\/|oauth|TOKEN|KEY|SECRET)/.test(serialized)) {
    throw new Error(`credential-like literal in ${name}`);
  }
}
'

# Re-running with identical managed files is idempotent and creates no backup.
"$ROOT/install.sh" --skip-packages
[[ ! -d "$PI_CODING_AGENT_DIR/backups" ]] || fail "idempotent run created a backup"

# Conflicting managed files fail closed unless --force is explicit.
printf 'local customization\n' > "$PI_CODING_AGENT_DIR/AGENTS.md"
if "$ROOT/install.sh" --skip-packages >/dev/null 2>&1; then
  fail "conflict should require --force"
fi
"$ROOT/install.sh" --skip-packages --force
assert_contains "$PI_CODING_AGENT_DIR/AGENTS.md" "Evidence and memory layers"
find "$PI_CODING_AGENT_DIR/backups" -type f -name AGENTS.md | grep -q . || fail "forced replacement did not back up AGENTS.md"

# Package preflight fails before writing when Pi is unavailable.
export PI_CODING_AGENT_DIR="$HOME/preflight-agent"
ln -sf "$(command -v node)" "$HOME/bin/node"
if PATH="$HOME/bin:/usr/bin:/bin" "$ROOT/install.sh" >/dev/null 2>&1; then
  fail "missing Pi should fail preflight"
fi
[[ ! -e "$PI_CODING_AGENT_DIR/AGENTS.md" ]] || fail "failed preflight wrote files"

# Dry-run leaves a clean target untouched.
export PI_CODING_AGENT_DIR="$HOME/dry-run-agent"
"$ROOT/install.sh" --skip-packages --dry-run
[[ ! -e "$PI_CODING_AGENT_DIR/AGENTS.md" ]] || fail "dry-run wrote files"

echo "install tests passed"
