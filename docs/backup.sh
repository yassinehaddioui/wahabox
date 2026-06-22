#!/bin/bash
# =============================================================================
# SpendWise — Backup Script
# =============================================================================
# Creates compressed backups of the PostgreSQL database and the attachments
# volume (receipt images / files stored at /var/lib/spendwise/attachments
# inside the api container).
#
# Usage:
#   ./backup.sh                          # Back up both DB and attachments
#   ./backup.sh --db-only                # Back up database only
#   ./backup.sh --attachments-only       # Back up attachments only
#   ./backup.sh --tag pre-deploy         # Add label to filenames
#   ./backup.sh --retention 14           # Override 30-day default
#
# Intended to be called:
#   - Manually by the operator
#   - Automatically by cron (daily)
#   - Automatically by update.sh (pre-deploy)
# =============================================================================
set -euo pipefail

# ── Change to the directory where this script lives ─────────────────────────
cd "$(dirname "$0")"

# ── Defaults ────────────────────────────────────────────────────────────────
BACKUP_DB=true
BACKUP_ATTACHMENTS=true
RETENTION_DAYS=30
TAG=""

# ── Parse arguments ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --db-only)
      BACKUP_ATTACHMENTS=false
      shift
      ;;
    --attachments-only|--uploads-only)
      BACKUP_DB=false
      shift
      ;;
    --tag)
      TAG="${2:?--tag requires a value}"
      shift 2
      ;;
    --retention)
      RETENTION_DAYS="${2:?--retention requires a number}"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--db-only] [--attachments-only] [--tag NAME] [--retention DAYS]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# ── Load environment variables ──────────────────────────────────────────────
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
else
  echo "ERROR: .env file not found. Cannot read database credentials." >&2
  exit 1
fi

POSTGRES_USER="${POSTGRES_USER:-spendwise}"
POSTGRES_DB="${POSTGRES_DB:-spendwise}"

# Path inside the api container where attachments are stored. Matches
# ATTACHMENTS_DIR in docker-compose.yml.
ATTACHMENTS_PATH_IN_CONTAINER="${ATTACHMENTS_DIR:-/var/lib/spendwise/attachments}"

# ── Paths & timestamp ──────────────────────────────────────────────────────
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_DIR="./backups/db"
ATTACHMENTS_DIR_HOST="./backups/attachments"

mkdir -p "$DB_DIR" "$ATTACHMENTS_DIR_HOST"

# Build filename with optional tag
if [ -n "$TAG" ]; then
  DB_FILE="db_${TAG}_${TIMESTAMP}.sql.gz"
  ATTACHMENTS_FILE="attachments_${TAG}_${TIMESTAMP}.tar.gz"
else
  DB_FILE="db_${TIMESTAMP}.sql.gz"
  ATTACHMENTS_FILE="attachments_${TIMESTAMP}.tar.gz"
fi

ERRORS=0

echo "========================================"
echo "  SpendWise Backup — $(date)"
echo "========================================"
echo ""

# ── Database backup ─────────────────────────────────────────────────────────
if [ "$BACKUP_DB" = true ]; then
  echo "▸ Backing up database '${POSTGRES_DB}'..."

  if docker compose exec -T postgres pg_dump \
       -U "${POSTGRES_USER}" \
       --clean --if-exists \
       --no-owner --no-privileges \
       "${POSTGRES_DB}" | gzip > "${DB_DIR}/${DB_FILE}"; then

    DB_SIZE=$(du -h "${DB_DIR}/${DB_FILE}" | cut -f1)
    echo "  ✓ Database backup: ${DB_DIR}/${DB_FILE} (${DB_SIZE})"
  else
    echo "  ✗ Database backup FAILED" >&2
    rm -f "${DB_DIR}/${DB_FILE}"
    ERRORS=$((ERRORS + 1))
  fi
  echo ""
fi

# ── Attachments backup ──────────────────────────────────────────────────────
if [ "$BACKUP_ATTACHMENTS" = true ]; then
  echo "▸ Backing up attachments volume (${ATTACHMENTS_PATH_IN_CONTAINER})..."

  # tar from inside the api container so we capture the live volume
  # contents regardless of the host-side mount path. -C <parent> <basename>
  # so the archive unpacks as `attachments/...` rather than absolute paths.
  ATTACH_PARENT=$(dirname "$ATTACHMENTS_PATH_IN_CONTAINER")
  ATTACH_BASENAME=$(basename "$ATTACHMENTS_PATH_IN_CONTAINER")

  if docker compose exec -T api tar czf - -C "$ATTACH_PARENT" "$ATTACH_BASENAME" \
       > "${ATTACHMENTS_DIR_HOST}/${ATTACHMENTS_FILE}"; then
    ATTACHMENTS_SIZE=$(du -h "${ATTACHMENTS_DIR_HOST}/${ATTACHMENTS_FILE}" | cut -f1)
    if gzip -t "${ATTACHMENTS_DIR_HOST}/${ATTACHMENTS_FILE}" 2>/dev/null; then
      echo "  ✓ Attachments backup: ${ATTACHMENTS_DIR_HOST}/${ATTACHMENTS_FILE} (${ATTACHMENTS_SIZE})"
    else
      echo "  ✗ Attachments archive is corrupt — removing" >&2
      rm -f "${ATTACHMENTS_DIR_HOST}/${ATTACHMENTS_FILE}"
      ERRORS=$((ERRORS + 1))
    fi
  else
    echo "  ✗ Attachments backup FAILED" >&2
    rm -f "${ATTACHMENTS_DIR_HOST}/${ATTACHMENTS_FILE}"
    ERRORS=$((ERRORS + 1))
  fi
  echo ""
fi

# ── Prune old backups ──────────────────────────────────────────────────────
echo "▸ Pruning backups older than ${RETENTION_DAYS} days..."

DB_PRUNED=$(find "$DB_DIR" -name "db_*.sql.gz" -type f -mtime +"$RETENTION_DAYS" -print -delete | wc -l)
ATTACH_PRUNED=$(find "$ATTACHMENTS_DIR_HOST" -name "attachments_*.tar.gz" -type f -mtime +"$RETENTION_DAYS" -print -delete | wc -l)

echo "  Removed: ${DB_PRUNED} DB backup(s), ${ATTACH_PRUNED} attachments backup(s)"
echo ""

# ── Summary ─────────────────────────────────────────────────────────────────
DB_COUNT=$(find "$DB_DIR" -name "db_*.sql.gz" -type f 2>/dev/null | wc -l)
DB_TOTAL=$(du -sh "$DB_DIR" 2>/dev/null | cut -f1)
ATTACH_COUNT=$(find "$ATTACHMENTS_DIR_HOST" -name "attachments_*.tar.gz" -type f 2>/dev/null | wc -l)
ATTACH_TOTAL=$(du -sh "$ATTACHMENTS_DIR_HOST" 2>/dev/null | cut -f1)

echo "========================================"
echo "  Summary"
echo "========================================"
echo "  DB backups:          ${DB_COUNT} files (${DB_TOTAL})"
echo "  Attachments backups: ${ATTACH_COUNT} files (${ATTACH_TOTAL})"
echo "  Retention:           ${RETENTION_DAYS} days"
echo "========================================"

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "⚠️  ${ERRORS} error(s) occurred during backup!" >&2
  exit 1
fi

echo ""
echo "✅ Backup complete."
exit 0