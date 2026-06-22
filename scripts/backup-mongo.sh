#!/usr/bin/env bash
# MongoDB backup script for ГДЕ ТОРТ?
# Usage: ./scripts/backup-mongo.sh
# Keeps last 7 daily backups.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/gde-tort}"
DB_NAME="${MONGO_DB:-gde_tort}"
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017}"
KEEP_DAYS=7

DATE=$(date +"%Y-%m-%d_%H-%M-%S")
DEST="$BACKUP_DIR/$DATE"

mkdir -p "$DEST"

echo "[backup] Dumping $DB_NAME → $DEST"
mongodump --uri="$MONGO_URI" --db="$DB_NAME" --out="$DEST" --quiet

# Compress
tar -czf "$DEST.tar.gz" -C "$BACKUP_DIR" "$DATE"
rm -rf "$DEST"

echo "[backup] Saved: $DEST.tar.gz"

# Rotate — delete backups older than KEEP_DAYS
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$KEEP_DAYS -delete
echo "[backup] Cleaned up backups older than $KEEP_DAYS days"
echo "[backup] Done."
