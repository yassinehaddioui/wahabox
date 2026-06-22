#!/usr/bin/env bash
set -euo pipefail

APP_SERVICE="app"
COMPOSE_FILE="docker-compose.dev.yml"
ENV_LABEL="dev"

# Parse --prod flag (must come before the command)
for arg in "$@"; do
  if [[ "$arg" == "--prod" ]]; then
    COMPOSE_FILE="docker-compose.yml"
    ENV_LABEL="prod"
    break
  fi
done

# Strip --prod from args so $1 is the command
args=()
for arg in "$@"; do
  [[ "$arg" != "--prod" ]] && args+=("$arg")
done
set -- "${args[@]+"${args[@]}"}"

usage() {
  cat <<EOF
Usage: ./dev.sh [--prod] <command>

Options:
  --prod    Use production docker-compose.yml instead of docker-compose.dev.yml

Commands:
  up        Install dependencies and start all containers
  down      Stop and remove all containers
  restart   Restart the app container only
  rebuild   Rebuild the app container (no cache)
  logs      Tail logs from all containers (Ctrl+C to stop)
  logs-app  Tail logs from the app container only
  db        Open a psql shell into the Postgres container
  redis     Open a redis-cli shell
  migrate   Run Prisma migrations
  reset-db  Drop and recreate the database, then migrate
  status    Show container status
  env       Print all environment variables in the app container
  clean     Stop containers and remove volumes (destroys data)
EOF
}

cmd_up() {
  echo "→ Installing dependencies..."
  pnpm i
  echo "→ Starting $ENV_LABEL containers..."
  docker compose -f "$COMPOSE_FILE" up -d
  echo "✓ $ENV_LABEL environment is up"
}

cmd_down() {
  echo "→ Stopping $ENV_LABEL containers..."
  docker compose -f "$COMPOSE_FILE" down
  echo "✓ Containers stopped"
}

cmd_restart() {
  echo "→ Restarting $APP_SERVICE ($ENV_LABEL)..."
  docker compose -f "$COMPOSE_FILE" restart "$APP_SERVICE"
  echo "✓ $APP_SERVICE restarted"
}

cmd_rebuild() {
  echo "→ Rebuilding $APP_SERVICE ($ENV_LABEL, no cache)..."
  docker compose -f "$COMPOSE_FILE" up -d --build --force-recreate --no-deps "$APP_SERVICE"
  echo "✓ $APP_SERVICE rebuilt and started"
}

cmd_logs() {
  docker compose -f "$COMPOSE_FILE" logs -f
}

cmd_logs_app() {
  docker compose -f "$COMPOSE_FILE" logs -f "$APP_SERVICE"
}

cmd_db() {
  echo "→ Connecting to Postgres ($ENV_LABEL)..."
  docker compose -f "$COMPOSE_FILE" exec postgres psql -U postgres -d wahabox
}

cmd_redis() {
  echo "→ Connecting to Redis ($ENV_LABEL)..."
  docker compose -f "$COMPOSE_FILE" exec redis redis-cli
}

cmd_migrate() {
  echo "→ Running Prisma migrations ($ENV_LABEL)..."
  docker compose -f "$COMPOSE_FILE" exec "$APP_SERVICE" pnpm prisma migrate deploy
  echo "✓ Migrations applied"
}

cmd_reset_db() {
  echo "→ Resetting database ($ENV_LABEL)..."
  docker compose -f "$COMPOSE_FILE" exec postgres psql -U postgres -c "DROP DATABASE IF EXISTS wahabox;"
  docker compose -f "$COMPOSE_FILE" exec postgres psql -U postgres -c "CREATE DATABASE wahabox;"
  cmd_migrate
  echo "✓ Database reset complete"
}

cmd_env() {
  docker compose -f "$COMPOSE_FILE" exec "$APP_SERVICE" env | sort
}

cmd_status() {
  docker compose -f "$COMPOSE_FILE" ps
}

cmd_clean() {
  echo "⚠  This will stop $ENV_LABEL containers and DELETE all volumes (database, redis, etc.)"
  read -rp "Continue? [y/N] " confirm
  if [[ "$confirm" =~ ^[Yy]$ ]]; then
    docker compose -f "$COMPOSE_FILE" down -v
    echo "✓ Containers and volumes removed"
  else
    echo "Aborted"
  fi
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

case "$1" in
  up)        cmd_up ;;
  down)      cmd_down ;;
  restart)   cmd_restart ;;
  rebuild)   cmd_rebuild ;;
  logs)      cmd_logs ;;
  logs-app)  cmd_logs_app ;;
  db)        cmd_db ;;
  redis)     cmd_redis ;;
  migrate)   cmd_migrate ;;
  reset-db)  cmd_reset_db ;;
  status)    cmd_status ;;
  env)       cmd_env ;;
  clean)     cmd_clean ;;
  -h|--help) usage ;;
  *)         echo "Unknown command: $1"; usage; exit 1 ;;
esac
