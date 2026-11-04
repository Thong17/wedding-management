#!/bin/sh
# Deploy the latest version: back up, get the newest config and images, restart.
# First push new images from your computer (`npm run dockerRelease`). Migrations run automatically
# when the backend starts. Run from the repository folder on the server.
set -eu
cd "$(dirname "$0")/.."

# Uses COMPOSE_FILE from .env when set (e.g. with the shared-proxy override), else the prod file.
if grep -q '^COMPOSE_FILE=' .env 2>/dev/null; then COMPOSE="docker compose"; else COMPOSE="docker compose -f docker-compose.prod.yml"; fi

# Service names: wedding-* in docker-compose.droplet.yml (shared networks), short names otherwise.
if $COMPOSE config --services | grep -qx wedding-db; then DB=wedding-db API=wedding-api WEB=wedding-web; else DB=db API=backend WEB=web; fi

sh deploy/backup.sh
# Compose file, Caddy config and scripts (skipped when only the compose file and .env were copied here).
if [ -d .git ]; then git pull --ff-only; fi
$COMPOSE pull "$API" "$WEB"  # images from Docker Hub
$COMPOSE up -d
docker image prune -f >/dev/null
$COMPOSE ps
