#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

node scripts/harden-dependencies.mjs
node scripts/validate.mjs
for runtime in paperclip-mcp figma-mcp mcp-image; do
  npm ci --ignore-scripts --omit=dev --prefix "runtime/$runtime"
done
bash tests/install_test.sh
node --test tests/*.test.mjs extensions/btw/*.test.ts extensions/dream/*.test.ts extensions/handoff/*.test.ts extensions/mcp-isolated/*.test.ts extensions/notify/*.test.ts extensions/sessions/*.test.ts extensions/shared/*.test.ts extensions/subagent/*.test.ts extensions/zikra/*.test.ts
shellcheck install.sh tests/install_test.sh scripts/check.sh runtime/op-read.sh runtime/*/launch.sh
npm audit
for runtime in paperclip-mcp figma-mcp mcp-image; do
  npm audit --prefix "runtime/$runtime"
done

git diff --check
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks dir . --no-banner --redact
else
  echo "warning: gitleaks is not installed; skipped secret scan" >&2
fi

echo "all checks passed"
