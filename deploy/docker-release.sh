#!/bin/sh
# Build and/or push the production images for DigitalOcean (linux/amd64).
#   sh deploy/docker-release.sh build     # build both images into the local Docker
#   sh deploy/docker-release.sh push      # push them to Docker Hub (after `docker login`)
#   sh deploy/docker-release.sh release   # both
# Runs in WSL, Linux or macOS. From Windows, use the npm scripts in the root package.json (they call WSL).
set -eu
cd "$(dirname "$0")/.."

API=${API_IMAGE:-thonggee/wedding-api:latest}
WEB=${WEB_IMAGE:-thonggee/wedding-web:latest}
PLATFORM=linux/amd64          # DigitalOcean droplets are x86
OCR=${VITE_OCR_LANGS:-eng+khm} # name-scanning languages, fixed into the app at build time

# On an ARM machine, building x86 images needs QEMU emulation registered with the kernel.
require_amd64() {
  [ "$(uname -m)" = x86_64 ] && return
  if ! docker run --rm --platform "$PLATFORM" alpine:3 true >/dev/null 2>&1; then
    echo "This machine can't run $PLATFORM images yet. Turn on emulation once (again after WSL restarts):" >&2
    echo "  docker run --privileged --rm tonistiigi/binfmt --install amd64" >&2
    exit 1
  fi
}

build() {
  require_amd64
  # The "default" builder keeps the images in the local Docker, so `push` can find them afterwards.
  docker buildx build --builder default --platform "$PLATFORM" --load -t "$API" ./backend
  docker buildx build --builder default --platform "$PLATFORM" --load \
    --build-arg VITE_OCR_LANGS="$OCR" -t "$WEB" -f deploy/web.Dockerfile .
}

push() {
  docker push "$API"
  docker push "$WEB"
}

case "${1:-}" in
  build) build ;;
  push) push ;;
  release) build && push ;;
  *) echo "usage: sh deploy/docker-release.sh build|push|release" >&2; exit 2 ;;
esac
