#!/bin/sh
# Deploy the latest code: back up, pull, rebuild and restart. Migrations run automatically when the
# backend starts. Run from the repository folder on the server.
set -eu
cd "$(dirname "$0")/.."

sh deploy/backup.sh
git pull --ff-only
docker compose -f docker-compose.prod.yml up -d --build
docker image prune -f >/dev/null
docker compose -f docker-compose.prod.yml ps
