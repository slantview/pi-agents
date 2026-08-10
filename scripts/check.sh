#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

node scripts/validate.mjs
bash tests/install_test.sh
node --test tests/*.test.mjs extensions/subagent/*.test.ts extensions/zikra/*.test.ts
shellcheck install.sh tests/install_test.sh scripts/check.sh
npm audit

git diff --check
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks dir . --no-banner --redact
else
  echo "warning: gitleaks is not installed; skipped secret scan" >&2
fi

echo "all checks passed"
