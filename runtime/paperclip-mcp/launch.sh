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
  if [ ! -r "$path_file" ]; then
    echo "Paperclip MCP trusted $1 is missing; rerun the installer." >&2
    exit 1
  fi
  IFS= read -r trusted_path < "$path_file"
  case "$trusted_path" in
    /*) ;;
    *) echo "Paperclip MCP trusted $1 is invalid." >&2; exit 1 ;;
  esac
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
  if [ ! -x "$node_bin" ] || [ ! -x "$op_bin" ] || [ ! -d "$trusted_home" ]; then
    echo "Paperclip MCP trusted runtime path is unavailable; rerun the installer." >&2
    exit 1
  fi
  exec /usr/bin/env -i \
    HOME="$trusted_home" \
    PATH='/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin' \
    /bin/sh "$script_path" --pi-mcp-clean-stage "$node_bin" "$op_bin" "$op_account"
fi
if [ "$#" -ne 4 ] || [ "$1" != "--pi-mcp-clean-stage" ]; then
  echo "Paperclip MCP rejected an invalid launcher stage." >&2
  exit 1
fi
node_bin=$2
op_bin=$3
op_account=$4
if [ ! -x "$node_bin" ] || [ ! -x "$op_bin" ] || [ ! -d "$HOME" ]; then
  echo "Paperclip MCP clean-stage runtime path is unavailable." >&2
  exit 1
fi

read_secret() {
  if [ -n "$op_account" ]; then set -- read --account "$op_account" "$1";
  else set -- read "$1"; fi
  "$op_bin" "$@" 2>/dev/null || {
    echo "Unable to resolve required Paperclip MCP configuration from 1Password." >&2
    exit 1
  }
}

api_url=$(read_secret 'op://Shared/LocalEnvironment/MCP/PAPERCLIP_API_URL')
company_id=$(read_secret 'op://Shared/LocalEnvironment/MCP/PAPERCLIP_COMPANY_ID')
token=$(read_secret 'op://Shared/LocalEnvironment/MCP/PAPERCLIP_PI_BOARD_TOKEN')
case "$api_url" in
  https://*) ;;
  *) echo "Paperclip MCP API URL must use HTTPS." >&2; exit 1 ;;
esac
if [ -z "$company_id" ] || [ -z "$token" ]; then
  echo "Paperclip MCP trusted configuration contains an empty value." >&2
  exit 1
fi

export PAPERCLIP_API_URL="$api_url"
export PAPERCLIP_COMPANY_ID="$company_id"
export PAPERCLIP_API_KEY="$token"
unset api_url company_id token
exec "$node_bin" "$script_dir/guarded-server.mjs"
