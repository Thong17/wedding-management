#!/bin/sh
# Back up the database and all uploads (profile pictures and client documents) into ./backups,
# keeping the last 14 days. Run from the repository folder on the server; see docs/deploy.md for cron.
set -eu
cd "$(dirname "$0")/.."

# Uses COMPOSE_FILE from .env when set (e.g. with the shared-proxy override), else the prod file.
if grep -q "^COMPOSE_FILE=" .env 2>/dev/null; then COMPOSE="docker compose"; else COMPOSE="docker compose -f docker-compose.prod.yml"; fi
# Service names: wedding-* in docker-compose.droplet.yml (shared networks), short names otherwise.
if $COMPOSE config --services | grep -qx wedding-db; then DB=wedding-db API=wedding-api WEB=wedding-web; else DB=db API=backend WEB=web; fi
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p backups

# Database: a plain SQL dump, restorable with psql.
$COMPOSE exec -T "$DB" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' | gzip > "backups/db-$STAMP.sql.gz"

# A setting as the running backend sees it (compose files may set defaults that .env leaves out),
# falling back to .env when the backend isn't running.
env_value() { $COMPOSE exec -T "$API" printenv "$1" 2>/dev/null || sed -n "s/^$1=//p" .env; }

# Uploads: from the MinIO bucket (STORAGE_BACKEND=s3) or straight out of the Docker volumes.
STORAGE=$(env_value STORAGE_BACKEND)
if [ "$STORAGE" = "s3" ]; then
  ENDPOINT=$(env_value S3_ENDPOINT_URL)
  # mc reads the server address and keys from MC_HOST_<alias>; it runs on the network that reaches MinIO.
  NETWORK=$(env_value S3_NETWORK)
  NETWORK=${NETWORK:-wedding-proxy}  # the Docker network where MinIO is reachable
  docker run --rm --network "$NETWORK" \
    -e "MC_HOST_store=${ENDPOINT%%://*}://$(env_value S3_ACCESS_KEY):$(env_value S3_SECRET_KEY)@${ENDPOINT#*://}" \
    -v "$(pwd)/backups:/backups" \
    --entrypoint sh minio/mc -c "mc mirror --quiet store/$(env_value S3_BUCKET) /tmp/files && tar czf /backups/files-$STAMP.tar.gz -C /tmp files"
else
  PROJECT=$($COMPOSE config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])')
  docker run --rm \
    -v "${PROJECT}_media:/media:ro" \
    -v "${PROJECT}_private_media:/private_media:ro" \
    -v "$(pwd)/backups:/backups" \
    alpine tar czf "/backups/files-$STAMP.tar.gz" -C / media private_media
fi

find backups -name 'db-*.sql.gz' -mtime +14 -delete
find backups -name 'files-*.tar.gz' -mtime +14 -delete
echo "Backed up to backups/db-$STAMP.sql.gz and backups/files-$STAMP.tar.gz"
