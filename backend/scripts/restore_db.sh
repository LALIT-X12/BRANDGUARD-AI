#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <path-to-dump-file>"
  exit 1
fi

pg_restore \
  --clean \
  --if-exists \
  --dbname="${DATABASE_URL:-postgresql://brandguard:brandguard@localhost:5432/brandguard}" \
  "$1"

echo "Database restored from $1"

