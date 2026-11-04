#!/bin/sh
# Apply database migrations and collect the admin's static files, then start the API.
set -e

python manage.py migrate --noinput
python manage.py collectstatic --noinput --verbosity 0
python manage.py ensure_storage || true   # MinIO / S3 only: bucket + public read on avatars/ (never blocks startup)

# 3 workers suits a 1–2 GB droplet. The timeout covers slow uploads of documents and gift batches.
exec gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers "${GUNICORN_WORKERS:-3}" \
  --timeout 60 \
  --access-logfile - \
  --forwarded-allow-ips "*"
