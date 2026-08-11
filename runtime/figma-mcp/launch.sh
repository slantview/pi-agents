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
  [ -r "$path_file" ] || { echo "Figma MCP trusted $1 is missing; rerun the installer." >&2; exit 1; }
  IFS= read -r trusted_path < "$path_file"
  case "$trusted_path" in /*) ;; *) echo "Figma MCP trusted $1 is invalid." >&2; exit 1 ;; esac
  printf '%s\n' "$trusted_path"
}

if [ "$#" -eq 0 ]; then
  node_bin=$(read_trusted_path node-path)
  op_bin=$(read_trusted_path op-path)
  trusted_home=$(read_trusted_path home-path)
  : "${IMAGE_DIR:?Set FIGMA_IMAGE_DIR before starting Pi}"
  case "$IMAGE_DIR" in /*) ;; *) echo "FIGMA_IMAGE_DIR must be absolute." >&2; exit 1 ;; esac
  if [ ! -x "$node_bin" ] || [ ! -x "$op_bin" ] || [ ! -d "$trusted_home" ]; then
    echo "Figma MCP trusted runtime path is unavailable; rerun the installer." >&2
    exit 1
  fi
  exec /usr/bin/env -i \
    HOME="$trusted_home" \
    PATH='/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin' \
    DO_NOT_TRACK="${DO_NOT_TRACK:-1}" \
    IMAGE_DIR="$IMAGE_DIR" \
    /bin/sh "$script_path" --pi-mcp-clean-stage "$node_bin" "$op_bin"
fi
if [ "$#" -ne 3 ] || [ "$1" != "--pi-mcp-clean-stage" ]; then
  echo "Figma MCP rejected an invalid launcher stage." >&2
  exit 1
fi
node_bin=$2
op_bin=$3
if [ ! -x "$node_bin" ] || [ ! -x "$op_bin" ]; then
  echo "Figma MCP clean-stage runtime path is unavailable." >&2
  exit 1
fi
figma_key=$("$op_bin" read 'op://Shared/LocalEnvironment/MCP/FIGMA_API_KEY' 2>/dev/null) || {
  echo "Unable to resolve the Figma MCP credential from 1Password." >&2
  exit 1
}
[ -n "$figma_key" ] || { echo "The Figma MCP credential is empty." >&2; exit 1; }
export FIGMA_API_KEY="$figma_key"
unset figma_key
exec "$node_bin" "$script_dir/node_modules/figma-developer-mcp/dist/bin.js" --stdio
