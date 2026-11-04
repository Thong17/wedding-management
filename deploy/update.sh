#!/bin/sh
# Deploy the latest version: back up, get the newest config and images, restart.
# First push new images from your computer (`npm run dockerRelease`). Migrations run automatically
# when the backend starts. Run from the repository folder on the server.
set -eu
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml"
sh deploy/backup.sh
git pull --ff-only           # compose file, Caddy config and scripts
$COMPOSE pull backend web    # images from Docker Hub
$COMPOSE up -d
docker image prune -f >/dev/null
$COMPOSE ps
