#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
PROFILE="safe"
FORCE=false
DRY_RUN=false
SKIP_PACKAGES=false

usage() {
  cat <<'EOF'
Usage: ./install.sh [options]

Options:
  --profile safe|local-parity  Permission profile (default: safe)
  --force                      Back up and replace conflicting managed files
  --dry-run                    Show planned actions without writing
  --skip-packages              Skip `pi install` operations
  -h, --help                   Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="${2:-}"; shift 2 ;;
    --profile=*) PROFILE="${1#*=}"; shift ;;
    --force) FORCE=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --skip-packages) SKIP_PACKAGES=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$PROFILE" in
  safe|local-parity) ;;
  *) echo "Invalid profile: $PROFILE" >&2; exit 2 ;;
esac

PERMISSION_SOURCE="$ROOT/config/permissions.$PROFILE.json"

if [[ "$SKIP_PACKAGES" != true && "$DRY_RUN" != true ]]; then
  if ! command -v pi >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo "Pi, Node.js, and npm are required. Follow README.md prerequisites, then rerun this installer." >&2
    exit 4
  fi
fi

managed_files() {
  printf '%s|%s\n' "$ROOT/global/AGENTS.md" "$AGENT_DIR/AGENTS.md"
  for source in "$ROOT"/agents/*.md; do
    printf '%s|%s\n' "$source" "$AGENT_DIR/agents/$(basename "$source")"
  done
  printf '%s|%s\n' "$PERMISSION_SOURCE" "$AGENT_DIR/extensions/pi-permission-system/config.json"
  printf '%s|%s\n' "$ROOT/config/eko24ive-pi-ask.json" "$AGENT_DIR/extensions/eko24ive-pi-ask.json"
  printf '%s|%s\n' "$ROOT/config/mcp.example.json" "$AGENT_DIR/mcp.json"
}

conflicts=0
while IFS='|' read -r source target; do
  if [[ -e "$target" || -L "$target" ]]; then
    if [[ -f "$target" && ! -L "$target" ]] && cmp -s "$source" "$target"; then
      continue
    fi
    if [[ "$FORCE" != true ]]; then
      echo "Conflict: $target" >&2
      conflicts=$((conflicts + 1))
    fi
  fi
done < <(managed_files)

if [[ $conflicts -gt 0 ]]; then
  echo "No files changed. Re-run with --force to back up and replace managed conflicts." >&2
  exit 3
fi

if [[ "$DRY_RUN" == true ]]; then
  while IFS='|' read -r _source target; do echo "Would install: $target"; done < <(managed_files)
  if [[ "$SKIP_PACKAGES" != true ]]; then echo "Would install pinned Pi packages and this local package."; fi
  exit 0
fi

backup_root=""
while IFS='|' read -r source target; do
  if [[ -e "$target" || -L "$target" ]]; then
    if [[ -f "$target" && ! -L "$target" ]] && cmp -s "$source" "$target"; then
      continue
    fi
    if [[ -z "$backup_root" ]]; then
      backup_root="$AGENT_DIR/backups/$(date -u +%Y%m%dT%H%M%SZ)-$$"
    fi
    relative="${target#"$AGENT_DIR"/}"
    mkdir -p "$backup_root/$(dirname "$relative")"
    cp -aP "$target" "$backup_root/$relative"
    rm -f "$target"
  fi
  mkdir -p "$(dirname "$target")"
  cp "$source" "$target"
done < <(managed_files)

if [[ "$SKIP_PACKAGES" != true ]]; then
  NPM_CONFIG_IGNORE_SCRIPTS=true npm ci --ignore-scripts --prefix "$ROOT"
  pi install "$ROOT"
fi

if [[ -n "$backup_root" ]]; then echo "Backed up replaced files to: $backup_root"; fi
echo "Installed Pi agents with the '$PROFILE' permission profile."
echo "Next: complete the credential and MCP checklist in README.md, then run /reload in Pi."
