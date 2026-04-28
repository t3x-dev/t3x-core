#!/usr/bin/env sh

set -eu

for file in "$@"; do
  [ -f "$file" ] || continue
  [ -s "$file" ] || continue
  perl -0pi -e 's/[ \t\r\n]*\z/\n/' "$file"
done
