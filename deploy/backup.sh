#!/bin/sh
# Back up the database and all uploads (profile pictures and client documents) into ./backups,
# keeping the last 14 days. Run from the repository folder on the server; see docs/deploy.md for cron.
set -eu
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml"
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p backups

# Database: a plain SQL dump, restorable with psql.
$COMPOSE exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' | gzip > "backups/db-$STAMP.sql.gz"

# Uploads: copied straight out of the Docker volumes.
PROJECT=$($COMPOSE config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])')
docker run --rm \
  -v "${PROJECT}_media:/media:ro" \
  -v "${PROJECT}_private_media:/private_media:ro" \
  -v "$(pwd)/backups:/backups" \
  alpine tar czf "/backups/files-$STAMP.tar.gz" -C / media private_media

find backups -name 'db-*.sql.gz' -mtime +14 -delete
find backups -name 'files-*.tar.gz' -mtime +14 -delete
echo "Backed up to backups/db-$STAMP.sql.gz and backups/files-$STAMP.tar.gz"
