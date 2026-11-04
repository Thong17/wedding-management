# Builds the Vue app, then serves it with Caddy (HTTPS, API proxy). Build context: repository root.

# The build stage runs on the build machine's own processor ($BUILDPLATFORM): its output (HTML/JS/CSS) is
# the same everywhere, and running it emulated (e.g. x86 on an ARM laptop) crashes esbuild under QEMU.
# Only the final Caddy stage is built for the droplet's platform.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
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
COPY deploy/caddy-media/ /etc/caddy/media/
# Drop Windows line endings, in case the image is built from a Windows checkout.
RUN sed -i 's/\r$//' /etc/caddy/Caddyfile /etc/caddy/media/*.caddy
COPY --from=build /app/dist /srv
