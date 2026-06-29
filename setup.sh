#!/usr/bin/env bash
# =============================================================================
# setup.sh — One-command bootstrap for Wahabox
# =============================================================================
# - Checks prerequisites (docker, docker compose v2, openssl)
# - Generates .env with secrets (if missing)
# - Starts the production Docker stack (PostgreSQL, Redis, app)
# - Runs database migrations
# =============================================================================
set -euo pipefail

# -- Colors -------------------------------------------------------------------
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# -- Helpers ------------------------------------------------------------------
info()  { printf "${BOLD}%s${NC}\n" "$*"; }
ok()    { printf "${GREEN}%s${NC}\n" "$*"; }
warn()  { printf "${YELLOW}%s${NC}\n" "$*"; }
err()   { printf "${RED}%s${NC}\n" "$*" >&2; }

# -- Prerequisite checks ------------------------------------------------------
info "→ Checking prerequisites..."

if ! command -v docker &>/dev/null; then
    err "✗ docker is not installed. Please install Docker first."
    exit 1
fi
ok "  ✓ docker found"

if ! docker compose version &>/dev/null; then
    err "✗ docker compose v2 is not available."
    err "  Upgrade Docker to a version that includes the 'docker compose' plugin."
    exit 1
fi
ok "  ✓ docker compose v2 found"

if ! command -v openssl &>/dev/null; then
    err "✗ openssl is not installed."
    exit 1
fi
ok "  ✓ openssl found"

# -- Generate .env if missing -------------------------------------------------
if [ ! -f .env ]; then
    echo ""
    info "→ .env not found — generating with random secrets..."
    bash scripts/setup-secrets.sh
else
    echo ""
    info "→ .env already exists — skipping secret generation."
fi

# -- Start production stack ----------------------------------------------------
echo ""
info "→ Starting production Docker stack (postgres, redis, app)..."
docker compose up -d

# -- Wait for services --------------------------------------------------------
echo ""
info "→ Waiting for services to be ready (10s)..."
sleep 10

# -- Run database migrations --------------------------------------------------
echo ""
info "→ Running database migrations..."
if docker compose run --rm migrate; then
    ok "  ✓ Migrations applied successfully"
else
    warn "  ⚠ Migration command exited with an error."
    warn "  You may need to run it manually once the stack is fully up."
fi

# -- Done ---------------------------------------------------------------------
echo ""
ok "✅ Wahabox is running at http://localhost:${HOST_PORT:-3000}"

echo ""
echo "  ${BOLD}First time?${NC} Create an account at http://localhost:${HOST_PORT:-3000}/signup"
echo "  ${BOLD}Production deploy?${NC} See DEPLOYMENT.md for reverse proxy setup"
