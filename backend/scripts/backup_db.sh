#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${1:-./backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

pg_dump "${DATABASE_URL:-postgresql://brandguard:brandguard@localhost:5432/brandguard}" \
  --format=custom \
  --file="$BACKUP_DIR/brandguard_${TIMESTAMP}.dump"

echo "Backup written to $BACKUP_DIR/brandguard_${TIMESTAMP}.dump"

