# Builds the Vue app, then serves it with Caddy (HTTPS, API proxy). Build context: repository root.

FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# The app calls the API on its own domain (Caddy forwards /api to Django), so no CORS is involved.
ARG VITE_OCR_LANGS=eng
ENV VITE_API_URL=/api \
    VITE_OCR_LANGS=$VITE_OCR_LANGS
# Only the production build here: the full type check (`npm run build`) needs more memory than a
# small droplet has, and already runs locally before deploying.
RUN npx vite build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
