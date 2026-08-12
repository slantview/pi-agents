#!/bin/sh
set -eu
umask 077

if [ "$#" -ne 1 ]; then
  echo "Trusted 1Password resolver requires one item reference." >&2
  exit 1
fi
case "$1" in
  op://*) reference=$1 ;;
  *) echo "Trusted 1Password resolver rejected a non-op reference." >&2; exit 1 ;;
esac
case "$0" in
  /*) script_path=$0 ;;
  *) script_path=$PWD/$0 ;;
esac
runtime_dir=${script_path%/*}
if [ ! -r "$runtime_dir/op-path" ] || [ ! -r "$runtime_dir/home-path" ]; then
  echo "Trusted 1Password runtime paths are missing; rerun the installer." >&2
  exit 1
fi
IFS= read -r op_bin < "$runtime_dir/op-path"
IFS= read -r trusted_home < "$runtime_dir/home-path"
case "$op_bin:$trusted_home" in
  /*:/*) ;;
  *) echo "Trusted 1Password runtime path is invalid." >&2; exit 1 ;;
esac
if [ ! -x "$op_bin" ] || [ ! -d "$trusted_home" ]; then
  echo "Trusted 1Password runtime path is unavailable; rerun the installer." >&2
  exit 1
fi

if [ -e "$runtime_dir/op-account" ]; then
  if [ ! -f "$runtime_dir/op-account" ] || [ -L "$runtime_dir/op-account" ] || [ ! -r "$runtime_dir/op-account" ]; then
    echo "Trusted 1Password account selection is invalid; rerun the installer." >&2
    exit 1
  fi
  IFS= read -r op_account < "$runtime_dir/op-account"
  case "$op_account" in ""|*[!A-Za-z0-9-]*) echo "Trusted 1Password account selection is invalid." >&2; exit 1 ;; esac
  set -- read --account "$op_account" "$reference"
else
  set -- read "$reference"
fi

exec /usr/bin/env -i \
  HOME="$trusted_home" \
  PATH='/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin' \
  "$op_bin" "$@"
