#!/usr/bin/env sh

set -eu

if grep -n -E '^(<<<<<<<|>>>>>>>)( .*)?$|^=======$' -- "$@"; then
  echo "Merge conflict marker found." >&2
  exit 1
fi
