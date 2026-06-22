#!/bin/bash
set -e

# Change to the directory where this script is located
cd "$(dirname "$0")"

# ── Configuration ───────────────────────────────────────────────────
# Load .env so we can pick up WEB_HOST_PORT (and anything else) without
# duplicating defaults here. `set -a` exports every var sourced.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

# WEB_HOST_PORT in .env may be either "8081" or "127.0.0.1:8081" —
# strip any "host:" prefix to get just the port for the curl URL.
WEB_PORT_RAW="${WEB_HOST_PORT:-127.0.0.1:8081}"
WEB_PORT="${WEB_PORT_RAW##*:}"

HEALTH_URL="${HEALTH_URL:-http://localhost:${WEB_PORT}/api/healthz}"
HEALTH_INTERVAL=5        # seconds between health check attempts
HEALTH_MAX_ATTEMPTS=24   # total attempts (24 × 5s = 120s — first deploy
                         # has to wait for postgres + migrations)
COMPOSE_PROJECT=$(basename "$(pwd)" | tr '[:upper:]' '[:lower:]')
# SpendWise rebuilds both the api and the web image. Both get prev-* tags
# so a rollback restores the exact pair that was running before.
SERVICES=(api web)
MAX_PREV_IMAGES=20       # number of previous images to keep per service

echo "========================================"
echo "  Deployment started at $(date)"
echo "========================================"

# Helper: docker-compose's image name follows "<project>-<service>".
image_name_for() {
  echo "${COMPOSE_PROJECT}-$1"
}

# ── Step 1: Tag current images with timestamped prev-* tags ─────────
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
PREV_TAG="prev-${TIMESTAMP}"
declare -A TAGGED_PREV    # service -> "true" if a prev tag was created
HAS_ANY_PREV=false

for svc in "${SERVICES[@]}"; do
  IMG=$(image_name_for "$svc")
  CURRENT_IMAGE_ID=$(docker compose images "$svc" -q 2>/dev/null | head -1)
  if [ -n "$CURRENT_IMAGE_ID" ]; then
    echo "Tagging current ${svc} image (${CURRENT_IMAGE_ID}) as ${IMG}:${PREV_TAG}..."
    docker tag "$CURRENT_IMAGE_ID" "${IMG}:${PREV_TAG}"
    TAGGED_PREV[$svc]=true
    HAS_ANY_PREV=true
  else
    echo "No existing ${svc} image found — rollback for ${svc} won't be available."
    TAGGED_PREV[$svc]=false
  fi
done

# ── Step 2: Pre-deploy backup (optional) ────────────────────────────
echo ""
if [ -x ./backup.sh ]; then
  echo "Creating pre-deploy backup..."
  if ./backup.sh --tag pre-deploy; then
    echo "Pre-deploy backup completed."
  else
    echo ""
    echo "========================================"
    echo "  ❌ Pre-deploy backup FAILED — aborting deployment."
    echo "========================================"
    echo "Fix the backup issue and retry, or run with:"
    echo "  SKIP_BACKUP=1 ./update.sh"
    if [ "${SKIP_BACKUP:-}" = "1" ]; then
      echo "⚠️  SKIP_BACKUP is set — continuing despite backup failure..."
    else
      exit 1
    fi
  fi
else
  echo "No ./backup.sh found — skipping pre-deploy backup."
  echo "  (Add an executable backup.sh to the repo root to enable this step.)"
fi

# ── Step 3: Pull latest code ────────────────────────────────────────
echo ""
echo "Pulling latest changes..."
git pull

# ── Step 4: Build and deploy ────────────────────────────────────────
echo ""
echo "Building new images (${SERVICES[*]})..."
docker compose build "${SERVICES[@]}"

echo ""
echo "Deploying new containers..."
# --no-deps avoids touching postgres; api and web are recreated.
docker compose up -d --no-deps "${SERVICES[@]}"

# ── Step 5: Health check polling ────────────────────────────────────
echo ""
echo "Waiting for app to become healthy..."
echo "  Endpoint: $HEALTH_URL"
echo "  Timeout:  $((HEALTH_INTERVAL * HEALTH_MAX_ATTEMPTS))s ($HEALTH_MAX_ATTEMPTS attempts × ${HEALTH_INTERVAL}s)"
echo ""

ATTEMPT=0
HEALTHY=false

while [ "$ATTEMPT" -lt "$HEALTH_MAX_ATTEMPTS" ]; do
  ATTEMPT=$((ATTEMPT + 1))
  sleep "$HEALTH_INTERVAL"

  HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")

  if [ "$HTTP_CODE" = "200" ]; then
    echo "  ✓ Attempt $ATTEMPT/$HEALTH_MAX_ATTEMPTS — HTTP $HTTP_CODE — healthy!"
    HEALTHY=true
    break
  else
    echo "  ✗ Attempt $ATTEMPT/$HEALTH_MAX_ATTEMPTS — HTTP $HTTP_CODE — not ready"
  fi
done

# ── Step 6: Handle result ───────────────────────────────────────────
echo ""

if [ "$HEALTHY" = true ]; then
  echo "========================================"
  echo "  ✅ Deployment successful!"
  echo "========================================"
  echo ""

  echo "Cleaning up dangling images..."
  docker image prune -f

  echo "Pruning old rollback images (keeping last $MAX_PREV_IMAGES per service)..."
  for svc in "${SERVICES[@]}"; do
    IMG=$(image_name_for "$svc")
    PREV_TAGS=$(docker images --format '{{.Tag}}' "$IMG" | grep '^prev-' | sort -r || true)
    COUNT=0
    for TAG in $PREV_TAGS; do
      COUNT=$((COUNT + 1))
      if [ "$COUNT" -gt "$MAX_PREV_IMAGES" ]; then
        echo "  Removing old image: ${IMG}:${TAG}"
        docker rmi "${IMG}:${TAG}" 2>/dev/null || true
      fi
    done
    KEPT=$(echo "$PREV_TAGS" | head -n "$MAX_PREV_IMAGES" | grep -c . || true)
    echo "  ${svc}: ${KEPT} rollback image(s) retained."
  done

  echo ""
  docker compose ps
  exit 0
else
  echo "========================================"
  echo "  ❌ Health check failed! Rolling back..."
  echo "========================================"

  echo ""
  for svc in "${SERVICES[@]}"; do
    echo "── Failed ${svc} container logs (last 50 lines) ──"
    docker compose logs --tail=50 "$svc" 2>/dev/null || true
    echo "── End of ${svc} logs ──"
    echo ""
  done

  if [ "$HAS_ANY_PREV" != true ]; then
    echo "No rollback images available (first deployment)."
    echo "Please investigate and fix manually."
    exit 1
  fi

  echo "Stopping failed containers..."
  docker compose stop "${SERVICES[@]}"

  for svc in "${SERVICES[@]}"; do
    if [ "${TAGGED_PREV[$svc]}" = true ]; then
      IMG=$(image_name_for "$svc")
      LATEST_PREV=$(docker images --format '{{.Tag}}' "$IMG" | grep '^prev-' | sort -r | head -1)
      if [ -n "$LATEST_PREV" ]; then
        echo "Rolling ${svc} back to ${IMG}:${LATEST_PREV}..."
        docker tag "${IMG}:${LATEST_PREV}" "${IMG}:latest"
      fi
    else
      echo "Skipping ${svc} rollback — no previous image was captured."
    fi
  done

  echo "Starting rolled-back containers..."
  docker compose up -d --no-deps "${SERVICES[@]}"

  echo "Verifying rollback health..."
  ROLLBACK_OK=false
  for i in $(seq 1 12); do
    sleep 5
    HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
      ROLLBACK_OK=true
      echo "  ✓ Rollback healthy (attempt $i/12)"
      break
    else
      echo "  ✗ Rollback check $i/12 — HTTP $HTTP_CODE"
    fi
  done

  echo ""
  if [ "$ROLLBACK_OK" = true ]; then
    echo "✅ Rollback successful — restored ${PREV_TAG} images."
  else
    echo "⚠️  Rollback may have failed — please check manually!"
  fi
  docker compose ps

  exit 1
fi