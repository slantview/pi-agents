#!/bin/sh
set -eu
umask 077

case "$0" in
  /*) script_path=$0 ;;
  *) script_path=$PWD/$0 ;;
esac
script_dir=${script_path%/*}

read_trusted_path() {
  path_file=$script_dir/../$1
  [ -r "$path_file" ] || { echo "Image MCP trusted $1 is missing; rerun the installer." >&2; exit 1; }
  IFS= read -r trusted_path < "$path_file"
  case "$trusted_path" in /*) ;; *) echo "Image MCP trusted $1 is invalid." >&2; exit 1 ;; esac
  printf '%s\n' "$trusted_path"
}

read_trusted_account() {
  account_file=$script_dir/../op-account
  [ -e "$account_file" ] || return 0
  if [ ! -f "$account_file" ] || [ -L "$account_file" ] || [ ! -r "$account_file" ]; then exit 1; fi
  IFS= read -r account < "$account_file"
  case "$account" in ""|*[!A-Za-z0-9-]*) exit 1 ;; esac
  printf '%s\n' "$account"
}

if [ "$#" -eq 0 ]; then
  node_bin=$(read_trusted_path node-path)
  op_bin=$(read_trusted_path op-path)
  trusted_home=$(read_trusted_path home-path)
  op_account=$(read_trusted_account)
  : "${IMAGE_OUTPUT_DIR:?Set MCP_IMAGE_OUTPUT_DIR before starting Pi}"
  case "$IMAGE_OUTPUT_DIR" in /*) ;; *) echo "MCP_IMAGE_OUTPUT_DIR must be absolute." >&2; exit 1 ;; esac
  if [ -n "${IMAGE_INPUT_DIR:-}" ]; then
    case "$IMAGE_INPUT_DIR" in /*) ;; *) echo "MCP_IMAGE_INPUT_DIR must be absolute." >&2; exit 1 ;; esac
  fi
  if [ ! -x "$node_bin" ] || [ ! -x "$op_bin" ] || [ ! -d "$trusted_home" ]; then
    echo "Image MCP trusted runtime path is unavailable; rerun the installer." >&2
    exit 1
  fi
  exec /usr/bin/env -i \
    HOME="$trusted_home" \
    PATH='/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin' \
    IMAGE_INPUT_DIR="${IMAGE_INPUT_DIR:-}" \
    IMAGE_OUTPUT_DIR="$IMAGE_OUTPUT_DIR" \
    IMAGE_QUALITY="${IMAGE_QUALITY:-balanced}" \
    /bin/sh "$script_path" --pi-mcp-clean-stage "$node_bin" "$op_bin" "$op_account"
fi
if [ "$#" -ne 4 ] || [ "$1" != "--pi-mcp-clean-stage" ]; then
  echo "Image MCP rejected an invalid launcher stage." >&2
  exit 1
fi
node_bin=$2
op_bin=$3
op_account=$4
if [ ! -x "$node_bin" ] || [ ! -x "$op_bin" ]; then
  echo "Image MCP clean-stage runtime path is unavailable." >&2
  exit 1
fi
if [ -n "$op_account" ]; then set -- read --account "$op_account" 'op://Shared/LocalEnvironment/GEMINI_API_KEY';
else set -- read 'op://Shared/LocalEnvironment/GEMINI_API_KEY'; fi
gemini_key=$("$op_bin" "$@" 2>/dev/null) || {
  echo "Unable to resolve the image MCP credential from 1Password." >&2
  exit 1
}
[ -n "$gemini_key" ] || { echo "The image MCP credential is empty." >&2; exit 1; }
export GEMINI_API_KEY="$gemini_key"
unset gemini_key
exec "$node_bin" "$script_dir/guarded-server.mjs"
