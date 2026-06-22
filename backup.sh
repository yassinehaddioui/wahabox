#!/bin/bash
# =============================================================================
# Wahabox — Database Backup Script
# =============================================================================
# Creates a compressed gzip backup of the PostgreSQL database via docker
# compose exec. Supports tagging and retention-based pruning.
#
# Usage:
#   ./backup.sh                          # Back up DB with default settings
#   ./backup.sh --tag pre-deploy         # Tag the backup filename
#   ./backup.sh --retention 7            # Override 30-day retention
#   ./backup.sh --help                   # Print usage
#
# Intended to be called:
#   - Manually by the operator
#   - Automatically by cron (daily)
#   - Automatically by deploy.sh (pre-deploy)
# =============================================================================
set -euo pipefail

# ── Change to the directory where this script lives ─────────────────────────
cd "$(dirname "$0")"

# ── Defaults ────────────────────────────────────────────────────────────────
RETENTION_DAYS=30
TAG=""

# ── Parse arguments ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      TAG="${2:?--tag requires a value}"
      shift 2
      ;;
    --retention)
      RETENTION_DAYS="${2:?--retention requires a number}"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--tag NAME] [--retention DAYS]"
      echo ""
      echo "Options:"
      echo "  --tag NAME         Add a label to the backup filename"
      echo "  --retention DAYS   Override default retention (default: 30)"
      echo "  -h, --help         Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# ── Prerequisite checks ────────────────────────────────────────────────────
echo "========================================"
echo "  Prerequisites"
echo "========================================"

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker is not running." >&2
  exit 1
fi
echo "  ✓ Docker is running"

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: docker compose (v2) is required but not available." >&2
  exit 1
fi
echo "  ✓ docker compose is available"

if ! which gzip find >/dev/null 2>&1; then
  echo "ERROR: Required tools missing: gzip, find" >&2
  exit 1
fi
echo "  ✓ Required tools (gzip, find) are available"
echo ""

# ── Postgres running check ─────────────────────────────────────────────────
echo "========================================"
echo "  Postgres Container"
echo "========================================"

if ! docker compose ps postgres --format json 2>/dev/null | grep -q '"State":"running"'; then
  echo "ERROR: Postgres container is not running." >&2
  echo "  Start it with: docker compose up -d postgres" >&2
  exit 1
fi
echo "  ✓ Postgres container is running"
echo ""

# ── Hardcoded DB credentials (from docker-compose.yml) ──────────────────────
POSTGRES_USER="postgres"
POSTGRES_DB="wahabox"

# ── Paths & timestamp ──────────────────────────────────────────────────────
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups/db"
mkdir -p "$BACKUP_DIR"

# Build filename with optional tag
if [ -n "$TAG" ]; then
  FILENAME="db_${TAG}_${TIMESTAMP}.sql.gz"
else
  FILENAME="db_${TIMESTAMP}.sql.gz"
fi

ERRORS=0

echo "========================================"
echo "  Wahabox Backup — $(date)"
echo "========================================"
echo ""

# ── Database backup ─────────────────────────────────────────────────────────
echo "▸ Backing up database '${POSTGRES_DB}'..."
echo "  Output: ${BACKUP_DIR}/${FILENAME}"
echo ""

if docker compose exec -T postgres pg_dump \
     -U "${POSTGRES_USER}" \
     --clean --if-exists \
     --no-owner --no-privileges \
     "${POSTGRES_DB}" | gzip > "${BACKUP_DIR}/${FILENAME}"; then

  # Validate gzip integrity
  if gzip -t "${BACKUP_DIR}/${FILENAME}"; then
    DB_SIZE=$(du -h "${BACKUP_DIR}/${FILENAME}" | cut -f1)
    echo "  ✓ Database backup: ${BACKUP_DIR}/${FILENAME} (${DB_SIZE})"
  else
    echo "  ✗ Backup file is corrupt — removing" >&2
    rm -f "${BACKUP_DIR}/${FILENAME}"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "  ✗ Database backup FAILED" >&2
  rm -f "${BACKUP_DIR}/${FILENAME}"
  ERRORS=$((ERRORS + 1))
fi
echo ""

# ── Prune old backups ──────────────────────────────────────────────────────
echo "▸ Pruning backups older than ${RETENTION_DAYS} days..."

DB_PRUNED=$(find "$BACKUP_DIR" -name "db_*.sql.gz" -type f -mtime +"$RETENTION_DAYS" -print -delete 2>/dev/null | wc -l | tr -d ' ')
echo "  Removed: ${DB_PRUNED:-0} backup(s)"
echo ""

# ── Summary ─────────────────────────────────────────────────────────────────
DB_COUNT=$(find "$BACKUP_DIR" -name "db_*.sql.gz" -type f 2>/dev/null | wc -l | tr -d ' ')
DB_TOTAL=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)

echo "========================================"
echo "  Summary"
echo "========================================"
echo "  DB backups:   ${DB_COUNT:-0} files (${DB_TOTAL:-0})"
echo "  Retention:    ${RETENTION_DAYS} days"
echo "========================================"

if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "  ${ERRORS} error(s) occurred during backup!" >&2
  exit 1
fi

echo ""
echo "  ✅ Backup complete."
exit 0
