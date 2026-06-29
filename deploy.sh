#!/bin/bash
# =============================================================================
# Wahabox — Production Deployment Script
# =============================================================================
# Performs a full production deployment: prev-image tagging, pre-deploy backup,
# git update, docker compose build, deploy with health-gated rollback.
# Designed for a single VPS running the production docker-compose stack.
#
# Usage:
#   ./deploy.sh                     # Full deployment
#   ./deploy.sh --help              # Show usage
#   SKIP_BACKUP=1 ./deploy.sh       # Skip pre-deploy backup
# =============================================================================
set -euo pipefail

# Change to the directory where this script is located
cd "$(dirname "$0")"

# ── Configuration (non-env-dependent) ────────────────────────────────
COMPOSE_PROJECT="wahabox-prod"
APP_SERVICE="app"
HEALTH_INTERVAL=5
HEALTH_MAX_ATTEMPTS=36        # 36 × 5s = 180s
MAX_PREV_IMAGES=10
DEPLOY_LOCK=".deploy.lock"
LOCK_TTL_MINUTES="${LOCK_TTL_MINUTES:-60}"

# ── Help ─────────────────────────────────────────────────────────────
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: ./deploy.sh [--help]

  Full production deployment of the Wahabox app.
  Designed for a single VPS running the production docker-compose stack.

Environment variables:
  SKIP_BACKUP=1           Skip pre-deploy backup
  HOST_PORT=3000          Port the app listens on (default: 3000)
  LOCK_TTL_MINUTES=60     Stale lock TTL in minutes (default: 60)

Phases:
  0. Prerequisite checks (docker, compose v2, curl, gzip, find, git)
  1. Deploy lock to prevent concurrent runs
  2. .env validation (SERVER_MASTER_SECRET, SESSION_SECRET)
  3. Disk space check (warn >85%, abort >95%)
  4. Pre-deploy backup (skipped if SKIP_BACKUP=1 or no ./backup.sh)
  5. Tag current image as prev-{timestamp}
  6. Git fetch + reset to origin/{current-branch}
  7. Start postgres/redis → build migrate+app (single pass) → run migrations → start app
  8. Health check polling (36 × 5s = 180s timeout, first attempt immediate)
  9. Success cleanup (parallel prune) or rollback on failure
EOF
  exit 0
fi

echo "========================================"
echo "  Wahabox Deployment — $(date)"
echo "========================================"
echo ""

# ── Phase 0: Prerequisite checks ─────────────────────────────────────
echo "▸ Checking prerequisites..."
docker info >/dev/null 2>&1 || { echo "  ✗ Docker daemon not running"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "  ✗ docker compose (v2) required"; exit 1; }
for cmd in curl gzip find git; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "  ✗ Missing required tool: $cmd"; exit 1; }
done
echo "  ✓ All prerequisites met"
echo ""

# ── Pre-fetch base images (background, overlaps with phases 1-6) ─────
echo "▸ Pre-fetching base images (parallel, overlaps with next phases)..."
docker pull node:26-alpine >/dev/null 2>&1 &
PULL_PID1=$!
docker pull postgres:17-alpine >/dev/null 2>&1 &
PULL_PID2=$!
docker pull redis:7-alpine >/dev/null 2>&1 &
PULL_PID3=$!
echo "  ✓ Base image pre-fetch started"
echo ""

# ── Phase 1: Deploy lock with stale detection ────────────────────────
echo "▸ Acquiring deploy lock..."
if [ -f "$DEPLOY_LOCK" ]; then
  OLD_PID=$(cat "$DEPLOY_LOCK")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    LOCK_AGE=$(( $(date +%s) - $(stat -c %Y "$DEPLOY_LOCK") ))
    if [ "$LOCK_AGE" -lt $((LOCK_TTL_MINUTES * 60)) ]; then
      echo "  ✗ Another deployment in progress (PID $OLD_PID, lock age ${LOCK_AGE}s)"
      exit 1
    fi
    echo "  ⚠ Stale lock found (${LOCK_AGE}s old, PID $OLD_PID) — removing"
  else
    echo "  ⚠ Stale lock found (PID $OLD_PID no longer running) — removing"
  fi
  rm -f "$DEPLOY_LOCK"
fi
echo $$ > "$DEPLOY_LOCK"
trap 'rm -f "$DEPLOY_LOCK"' EXIT
echo "  ✓ Deploy lock acquired (PID $$)"
echo ""

# ── Phase 2: Source .env and validate secrets ────────────────────────
echo "▸ Loading environment..."
if [ ! -f .env ]; then
  echo "  ✗ Missing .env file — copy .env.example to .env and fill in secrets"
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

if [ -z "${SERVER_MASTER_SECRET:-}" ]; then
  echo "  ✗ SERVER_MASTER_SECRET is not set in .env"
  exit 1
fi
if [ -z "${SESSION_SECRET:-}" ]; then
  echo "  ✗ SESSION_SECRET is not set in .env"
  exit 1
fi
echo "  ✓ .env loaded and secrets validated"
echo ""

# ── Configuration (env-dependent) ────────────────────────────────────
HOST_PORT="${HOST_PORT:-3000}"
IMAGE_NAME="${COMPOSE_PROJECT}-${APP_SERVICE}"  # wahabox-prod-app
HEALTH_URL="http://localhost:${HOST_PORT}/api/healthz"
ROLLBACK_MAX_ATTEMPTS=12     # 12 × 5s = 60s for rollback verification

# ── Phase 3: Disk space check ────────────────────────────────────────
echo "▸ Checking disk space..."
USAGE=$(df -h . | awk 'NR==2 {print $5}' | tr -d '%')
if [ "$USAGE" -gt 95 ]; then
  echo "  ✗ Disk usage at ${USAGE}% — aborting deployment (threshold: 95%)"
  exit 1
fi
if [ "$USAGE" -gt 85 ]; then
  echo "  ⚠ Disk usage at ${USAGE}% — consider freeing space (threshold: 85%)"
else
  echo "  ✓ Disk usage at ${USAGE}%"
fi
echo ""

# ── Phase 4: Pre-deploy backup ───────────────────────────────────────
if [ -x ./backup.sh ] && [ "${SKIP_BACKUP:-0}" != "1" ]; then
  echo "▸ Running pre-deploy backup..."
  if ./backup.sh --tag pre-deploy; then
    echo "  ✓ Pre-deploy backup completed"
  else
    echo "  ✗ Pre-deploy backup failed — aborting deployment"
    echo "  Fix the backup issue and retry, or run with:  SKIP_BACKUP=1 ./deploy.sh"
    exit 1
  fi
elif [ ! -x ./backup.sh ]; then
  echo "▸ No ./backup.sh found — skipping pre-deploy backup"
else
  echo "▸ SKIP_BACKUP=1 — skipping pre-deploy backup"
fi
echo ""

# ── Phase 5: Tag current image for rollback ──────────────────────────
echo "▸ Tagging current image for rollback..."
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
PREV_TAG="prev-${TIMESTAMP}"
CURRENT_IMAGE_ID=$(docker compose images "$APP_SERVICE" -q 2>/dev/null | head -1 || true)

if [ -n "$CURRENT_IMAGE_ID" ]; then
  docker tag "$CURRENT_IMAGE_ID" "${IMAGE_NAME}:${PREV_TAG}"
  HAS_PREV=true
  echo "  ✓ Tagged current image as ${IMAGE_NAME}:${PREV_TAG}"
else
  HAS_PREV=false
  echo "  ⓘ No current image found — first deployment (rollback unavailable)"
fi
echo ""

# ── Phase 6: Git update ─────────────────────────────────────────────
echo "▸ Updating source code..."
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "  ✗ Working directory is not clean — commit or stash changes first"
  exit 1
fi
git pull --ff-only
echo "  ✓ Pulled latest changes"
echo ""

# ── Pre-build: Write version file on host (git available) ─────────────
echo "▸ Writing version.json with current git SHA..."
node scripts/write-version.mjs
echo "  ✓ version.json written"
echo ""

# ── Phase 7: Build and deploy ───────────────────────────────────────
wait $PULL_PID1 $PULL_PID2 $PULL_PID3 2>/dev/null || true

echo "▸ Starting postgres and redis (warmup in parallel with build)..."
docker compose up -d postgres redis
echo "  ✓ Database containers starting"
echo ""

echo "▸ Building migrate and ${APP_SERVICE} images (shared stages, single pass)..."
docker compose build migrate "$APP_SERVICE"
echo "  ✓ Build complete"
echo ""

echo "▸ Running migrations..."
docker compose run --rm migrate
echo "  ✓ Migrations applied"
echo ""

echo "▸ Deploying ${APP_SERVICE} container..."
docker compose up -d --no-deps "$APP_SERVICE"
echo "  ✓ Container started"
echo ""

# ── Phase 8: Health check polling ────────────────────────────────────
echo "▸ Waiting for app to become healthy..."
echo "  Endpoint: $HEALTH_URL"
echo "  Timeout:  $((HEALTH_INTERVAL * HEALTH_MAX_ATTEMPTS))s ($HEALTH_MAX_ATTEMPTS attempts × ${HEALTH_INTERVAL}s)"
echo ""

ATTEMPT=0
HEALTHY=false

while [ "$ATTEMPT" -lt "$HEALTH_MAX_ATTEMPTS" ]; do
  ATTEMPT=$((ATTEMPT + 1))

  HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")

  if [ "$HTTP_CODE" = "200" ]; then
    echo "  ✓ Attempt $ATTEMPT/$HEALTH_MAX_ATTEMPTS — HTTP $HTTP_CODE — healthy!"
    HEALTHY=true
    break
  else
    echo "  ✗ Attempt $ATTEMPT/$HEALTH_MAX_ATTEMPTS — HTTP $HTTP_CODE — not ready"
  fi

  [ "$ATTEMPT" -lt "$HEALTH_MAX_ATTEMPTS" ] && sleep "$HEALTH_INTERVAL"
done
echo ""

# ── Phase 9: Handle result ──────────────────────────────────────────
if [ "$HEALTHY" = true ]; then
  # ── Phase 9a: Success ──────────────────────────────────────────────
  echo "========================================"
  echo "  ✅ Deployment successful!"
  echo "========================================"
  echo ""

  echo "▸ Cleaning up dangling images (background)..."
  docker image prune -f &
  PRUNE_PID=$!

  echo "▸ Pruning old rollback images (keeping last $MAX_PREV_IMAGES)..."
  PREV_TAGS=$(docker images --format '{{.Tag}}' "$IMAGE_NAME" 2>/dev/null | grep '^prev-' | sort -r || true)
  if [ -n "$PREV_TAGS" ]; then
    COUNT=0
    for TAG in $PREV_TAGS; do
      COUNT=$((COUNT + 1))
      if [ "$COUNT" -gt "$MAX_PREV_IMAGES" ]; then
        echo "  Removing old image: ${IMAGE_NAME}:${TAG}"
        docker rmi "${IMAGE_NAME}:${TAG}" 2>/dev/null || true
      fi
    done
    KEPT=$(echo "$PREV_TAGS" | head -n "$MAX_PREV_IMAGES" | grep -c . || echo "0")
    echo "  ${APP_SERVICE}: ${KEPT} rollback image(s) retained"
  else
    echo "  No prev-* images to prune"
  fi

  wait $PRUNE_PID
  echo ""
  docker compose ps
  exit 0
else
  # ── Phase 9b: Failure — Rollback ──────────────────────────────────
  echo "========================================"
  echo "  ❌ Health check failed — rolling back..."
  echo "========================================"
  echo ""

  echo "── Failed ${APP_SERVICE} container logs (last 50 lines) ──"
  docker compose logs --tail=50 "$APP_SERVICE" 2>/dev/null || true
  echo "── End of ${APP_SERVICE} logs ──"
  echo ""

  if [ "$HAS_PREV" != true ]; then
    echo "✗ No rollback image available (first deployment)."
    echo "  Please investigate and fix manually."
    exit 1
  fi

  echo "▸ Stopping failed ${APP_SERVICE} container..."
  docker compose stop "$APP_SERVICE"

  echo "▸ Rolling back to previous image..."
  LATEST_PREV=$(docker images --format '{{.Tag}}' "$IMAGE_NAME" 2>/dev/null | grep '^prev-' | sort -r | head -1 || true)
  if [ -z "$LATEST_PREV" ]; then
    echo "  ✗ No prev-* tag found — rollback impossible"
    echo "  Please investigate and fix manually."
    exit 1
  fi

  echo "  Restoring ${IMAGE_NAME}:${LATEST_PREV} as ${IMAGE_NAME}:latest..."
  docker tag "${IMAGE_NAME}:${LATEST_PREV}" "${IMAGE_NAME}:latest"

  echo "▸ Starting rolled-back ${APP_SERVICE} container..."
  docker compose up -d --no-deps "$APP_SERVICE"

  echo "▸ Verifying rollback health ($((ROLLBACK_MAX_ATTEMPTS * HEALTH_INTERVAL))s timeout)..."
  ROLLBACK_OK=false
  for i in $(seq 1 "$ROLLBACK_MAX_ATTEMPTS"); do
    HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
      ROLLBACK_OK=true
      echo "  ✓ Rollback healthy (attempt $i/${ROLLBACK_MAX_ATTEMPTS})"
      break
    else
      echo "  ✗ Rollback check $i/${ROLLBACK_MAX_ATTEMPTS} — HTTP $HTTP_CODE"
    fi
    [ "$i" -lt "$ROLLBACK_MAX_ATTEMPTS" ] && sleep "$HEALTH_INTERVAL"
  done

  echo ""
  if [ "$ROLLBACK_OK" = true ]; then
    echo "✅ Rollback successful — restored ${IMAGE_NAME}:${LATEST_PREV}"
  else
    echo "⚠️  Rollback health check failed — please verify manually!"
  fi
  docker compose ps

  exit 1
fi
