# Django API for production (see docker-compose.prod.yml and docs/deploy.md).
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_DEBUG=0 \
    DJANGO_MEDIA_ROOT=/data/media \
    DJANGO_PRIVATE_MEDIA_ROOT=/data/private_media \
    DJANGO_STATIC_ROOT=/data/static

WORKDIR /app
COPY requirements.txt requirements-prod.txt ./
RUN pip install --no-cache-dir -r requirements-prod.txt

COPY . .
# Run as an unprivileged user. The /data folders become Docker volumes and keep this ownership.
# The sed drops Windows line endings, in case the image is built from a Windows checkout.
RUN useradd --create-home app \
    && mkdir -p /data/media /data/private_media /data/static \
    && chown -R app:app /data \
    && sed -i 's/\r$//' docker-entrypoint.sh \
    && chmod +x docker-entrypoint.sh
USER app

EXPOSE 8000
ENTRYPOINT ["./docker-entrypoint.sh"]
