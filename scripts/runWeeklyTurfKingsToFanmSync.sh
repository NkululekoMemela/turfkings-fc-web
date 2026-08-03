#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="/home/nc.memela/Projects/turfkings-app"
NODE="/usr/bin/node"
BACKUP_ROOT="/home/nc.memela/Projects/turfkings-backups/firestore/production"
LOG_ROOT="/home/nc.memela/Projects/turfkings-backups/logs"
LOCK_FILE="/tmp/turfkings_to_fanm_weekly_sync.lock"
MODE="${1:-execute}"

mkdir -p "$BACKUP_ROOT" "$LOG_ROOT"

TIMESTAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
LOG_FILE="$LOG_ROOT/turfkings-to-fanm_${TIMESTAMP}.log"

exec 9>"$LOCK_FILE"

if ! flock -n 9; then
  echo "Another Turf Kings → FANM migration is already running."
  exit 1
fi

exec > >(tee -a "$LOG_FILE") 2>&1

echo
echo "======================================================"
echo "TURF KINGS → FANM WEEKLY AUTOMATION"
echo "Started: $(date --iso-8601=seconds)"
echo "Mode: $MODE"
echo "Log: $LOG_FILE"
echo "======================================================"
echo

cd "$PROJECT_ROOT"

required_files=(
  "scripts/backupFirestore.cjs"
  "scripts/backupFanmBaselineToDrive.cjs"
  "scripts/syncTurfKingsProductionToFanm.cjs"
  "/home/nc.memela/Projects/FANM_SECRETS/fanm-backup-bot.json"
  "/home/nc.memela/Projects/FANM_SECRETS/fanm-drive-oauth-client.json"
  "/home/nc.memela/Projects/FANM_SECRETS/fanm-drive-oauth-token.json"
)

for required_file in "${required_files[@]}"; do
  if [[ ! -f "$required_file" ]]; then
    echo "ERROR: Missing required file: $required_file"
    exit 1
  fi
done

echo "Preflight checks passed."
echo "Repository commit: $(git rev-parse --short HEAD)"
echo

if [[ "$MODE" == "--check" ]]; then
  echo "Running migration dry run only..."
  "$NODE" scripts/syncTurfKingsProductionToFanm.cjs
  echo
  echo "CHECK COMPLETE. No Firestore writes were made."
  exit 0
fi

echo "STEP 1/4 — Backing up Turf Kings production"
FIREBASE_PROJECT_ID="turfkings-fc" \
BACKUP_ROOT="$BACKUP_ROOT" \
"$NODE" scripts/backupFirestore.cjs

echo
echo "STEP 2/4 — Backing up current FANM production"
"$NODE" scripts/backupFanmBaselineToDrive.cjs

echo
echo "STEP 3/4 — Validating the new Turf Kings backup"
"$NODE" scripts/syncTurfKingsProductionToFanm.cjs

echo
echo "STEP 4/4 — Synchronizing Turf Kings into FANM"
"$NODE" scripts/syncTurfKingsProductionToFanm.cjs --execute --confirm

echo
echo "======================================================"
echo "WEEKLY AUTOMATION COMPLETE"
echo "Finished: $(date --iso-8601=seconds)"
echo "======================================================"
