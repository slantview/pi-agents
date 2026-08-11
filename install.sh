#!/bin/bash -p
set -euo pipefail
if [[ $- != *p* ]]; then
  echo "Run this installer directly so its privileged-mode startup protections are active." >&2
  exit 2
fi
unset BASH_ENV ENV NODE_OPTIONS NODE_PATH NODE_EXTRA_CA_CERTS NODE_TLS_REJECT_UNAUTHORIZED
unset LD_PRELOAD LD_LIBRARY_PATH DYLD_INSERT_LIBRARIES DYLD_LIBRARY_PATH

script_dir=${BASH_SOURCE[0]%/*}
[[ "$script_dir" == "${BASH_SOURCE[0]}" ]] && script_dir=.
ROOT="$(cd "$script_dir" && pwd -P)"
PATH='/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'
export PATH
AGENT_DIR="${PI_CODING_AGENT_DIR:-}"
PROFILE="safe"
FORCE=false
DRY_RUN=false
SKIP_PACKAGES=false
TRUSTED_HOME_OVERRIDE=""
NODE_BIN_OVERRIDE=""
NPM_BIN_OVERRIDE=""
PI_BIN_OVERRIDE=""
OP_BIN_OVERRIDE=""

usage() {
  cat <<'EOF'
Usage: ./install.sh [options]

Options:
  --profile safe|local-parity  Permission profile (default: safe)
  --force                      Back up and replace conflicting managed files
  --dry-run                    Show planned actions without writing
  --skip-packages              Skip dependency and Pi package installation
  --trusted-home PATH          Explicit reviewed account home
  --node-bin PATH              Explicit reviewed Node executable
  --npm-bin PATH               Explicit reviewed npm executable
  --pi-bin PATH                Explicit reviewed Pi executable
  --op-bin PATH                Explicit reviewed 1Password CLI executable
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
    --trusted-home) TRUSTED_HOME_OVERRIDE="${2:-}"; shift 2 ;;
    --node-bin) NODE_BIN_OVERRIDE="${2:-}"; shift 2 ;;
    --npm-bin) NPM_BIN_OVERRIDE="${2:-}"; shift 2 ;;
    --pi-bin) PI_BIN_OVERRIDE="${2:-}"; shift 2 ;;
    --op-bin) OP_BIN_OVERRIDE="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$PROFILE" in
  safe|local-parity) ;;
  *) echo "Invalid profile: $PROFILE" >&2; exit 2 ;;
esac

PERMISSION_SOURCE="$ROOT/config/permissions.$PROFILE.json"
NODE_BIN=""
NPM_BIN=""
PI_BIN=""
OP_BIN=""
TRUSTED_HOME=""

resolve_account_home() {
  if [[ -n "$TRUSTED_HOME_OVERRIDE" ]]; then
    printf '%s\n' "$TRUSTED_HOME_OVERRIDE"
    return
  fi
  local record username uid home
  case "$(/usr/bin/uname -s)" in
    Darwin)
      username="$(/usr/bin/id -un)"
      record="$(/usr/bin/dscl . -read "/Users/$username" NFSHomeDirectory)" || return 1
      home=${record#*: }
      ;;
    Linux)
      uid="$(/usr/bin/id -u)"
      if [[ -x /usr/bin/getent ]]; then
        record="$(/usr/bin/getent passwd "$uid")"
      elif [[ -x /bin/getent ]]; then
        record="$(/bin/getent passwd "$uid")"
      else
        return 1
      fi
      IFS=: read -r _ _ _ _ _ home _ <<< "$record"
      ;;
    *) return 1 ;;
  esac
  printf '%s\n' "$home"
}

is_reviewed_default_executable() {
  case "$1" in
    "$TRUSTED_HOME"/.nvm/versions/node/*|"$TRUSTED_HOME"/.local/bin/*|/opt/homebrew/*|/usr/local/*|/usr/bin/*|/bin/*) return 0 ;;
    *) return 1 ;;
  esac
}

resolve_trusted_executable() {
  local name="$1" candidate="$2" option_name="$3" explicit=false canonical
  if [[ -n "$candidate" ]]; then
    explicit=true
  else
    candidate="$(command -v "$name" 2>/dev/null || true)"
  fi
  if [[ "$candidate" != /* || "$candidate" == *$'\n'* || ! -x "$candidate" ]]; then
    echo "Trusted executable for $name is missing or invalid." >&2
    return 1
  fi
  if [[ "$explicit" != true ]] && ! is_reviewed_default_executable "$candidate"; then
    echo "Refusing PATH-selected $name outside reviewed executable roots: $candidate" >&2
    echo "Use $option_name with an explicitly reviewed absolute executable if required." >&2
    return 1
  fi
  if [[ -n "$NODE_BIN" ]]; then
    canonical="$(/usr/bin/env -i HOME="$TRUSTED_HOME" PATH="$PATH" "$NODE_BIN" -e 'process.stdout.write(require("node:fs").realpathSync(process.argv[1]))' "$candidate")" || return 1
    if [[ "$explicit" != true ]] && ! is_reviewed_default_executable "$canonical"; then
      echo "Refusing $name symlink target outside reviewed executable roots: $canonical" >&2
      return 1
    fi
  fi
  printf '%s\n' "$candidate"
}

if [[ "$SKIP_PACKAGES" != true && "$DRY_RUN" != true ]]; then
  TRUSTED_HOME="$(resolve_account_home)" || {
    echo "Unable to derive the account home; use --trusted-home explicitly." >&2
    exit 4
  }
  if [[ "$TRUSTED_HOME" != /* || ! -d "$TRUSTED_HOME" ]]; then
    echo "The trusted account home must identify an existing absolute directory." >&2
    exit 4
  fi
  nvm_node_dir=""
  for candidate_dir in "$TRUSTED_HOME"/.nvm/versions/node/*/bin; do
    [[ -d "$candidate_dir" ]] && nvm_node_dir=$candidate_dir
  done
  PATH="${nvm_node_dir:+$nvm_node_dir:}$TRUSTED_HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
  export PATH
  NODE_BIN="$(resolve_trusted_executable node "$NODE_BIN_OVERRIDE" --node-bin)" || exit 4
  NPM_BIN="$(resolve_trusted_executable npm "$NPM_BIN_OVERRIDE" --npm-bin)" || exit 4
  PI_BIN="$(resolve_trusted_executable pi "$PI_BIN_OVERRIDE" --pi-bin)" || exit 4
  OP_BIN="$(resolve_trusted_executable op "$OP_BIN_OVERRIDE" --op-bin)" || exit 4
  PATH="${NODE_BIN%/*}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
  export PATH
  [[ -n "$AGENT_DIR" ]] || AGENT_DIR="$TRUSTED_HOME/.pi/agent"
else
  TRUSTED_HOME="${TRUSTED_HOME_OVERRIDE:-$HOME}"
  [[ -n "$AGENT_DIR" ]] || AGENT_DIR="$HOME/.pi/agent"
fi

managed_files() {
  printf '%s|%s\n' "$ROOT/global/AGENTS.md" "$AGENT_DIR/AGENTS.md"
  for source in "$ROOT"/agents/*.md; do
    printf '%s|%s\n' "$source" "$AGENT_DIR/agents/$(basename "$source")"
  done
  printf '%s|%s\n' "$PERMISSION_SOURCE" "$AGENT_DIR/extensions/pi-permission-system/config.json"
  printf '%s|%s\n' "$ROOT/config/eko24ive-pi-ask.json" "$AGENT_DIR/extensions/eko24ive-pi-ask.json"
  printf '%s|%s\n' "$ROOT/config/mcp.example.json" "$AGENT_DIR/mcp.json"
  printf '%s|%s\n' "$ROOT/runtime/op-read.sh" "$AGENT_DIR/runtime/op-read.sh"
  for runtime in paperclip-mcp figma-mcp mcp-image; do
    printf '%s|%s\n' "$ROOT/runtime/$runtime/package.json" "$AGENT_DIR/runtime/$runtime/package.json"
    printf '%s|%s\n' "$ROOT/runtime/$runtime/package-lock.json" "$AGENT_DIR/runtime/$runtime/package-lock.json"
    printf '%s|%s\n' "$ROOT/runtime/$runtime/launch.sh" "$AGENT_DIR/runtime/$runtime/launch.sh"
    for source in "$ROOT/runtime/$runtime"/*.mjs; do
      [[ -f "$source" ]] || continue
      printf '%s|%s\n' "$source" "$AGENT_DIR/runtime/$runtime/$(basename "$source")"
    done
  done
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
  if [[ "$SKIP_PACKAGES" != true ]]; then echo "Would install locked dependencies, isolated MCP runtimes, and this local package."; fi
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
  /usr/bin/env -i HOME="$TRUSTED_HOME" PATH="$PATH" NPM_CONFIG_IGNORE_SCRIPTS=true "$NPM_BIN" ci --ignore-scripts --prefix "$ROOT"
  /usr/bin/env -i HOME="$TRUSTED_HOME" PATH="$PATH" "$NODE_BIN" "$ROOT/scripts/harden-dependencies.mjs"
  mkdir -p "$AGENT_DIR/runtime"
  printf '%s\n' "$NODE_BIN" > "$AGENT_DIR/runtime/node-path"
  printf '%s\n' "$OP_BIN" > "$AGENT_DIR/runtime/op-path"
  printf '%s\n' "$TRUSTED_HOME" > "$AGENT_DIR/runtime/home-path"
  chmod 600 "$AGENT_DIR/runtime/node-path" "$AGENT_DIR/runtime/op-path" "$AGENT_DIR/runtime/home-path"
  for runtime in paperclip-mcp figma-mcp mcp-image; do
    /usr/bin/env -i HOME="$TRUSTED_HOME" PATH="$PATH" NPM_CONFIG_IGNORE_SCRIPTS=true "$NPM_BIN" ci --ignore-scripts --omit=dev --prefix "$AGENT_DIR/runtime/$runtime"
  done
  /usr/bin/env -i HOME="$TRUSTED_HOME" PATH="$PATH" PI_CODING_AGENT_DIR="$AGENT_DIR" "$PI_BIN" install "$ROOT"
fi

if [[ -n "$backup_root" ]]; then echo "Backed up replaced files to: $backup_root"; fi
echo "Installed Pi agents with the '$PROFILE' permission profile."
echo "Next: complete the credential and MCP checklist in README.md, then run /reload in Pi."
