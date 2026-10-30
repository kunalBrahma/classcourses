#!/usr/bin/env bash
# Runs ON the VPS, from CI or by hand:  deploy/deploy.sh <tag> <service...>
#   deploy/deploy.sh sha-abc123 backend            # API (migrations run first)
#   deploy/deploy.sh sha-abc123 frontend admin     # student site + admin
#   deploy/deploy.sh latest backend frontend admin # everything, newest images
# Pulls pre-built images from GHCR (never builds here: the VPS is shared) and
# waits until the services are healthy, or fails.
set -euo pipefail
cd "$(dirname "$0")/.."

tag="${1:?usage: deploy/deploy.sh <tag> <service...>}"; shift
[ "$#" -gt 0 ] || { echo "name at least one service" >&2; exit 2; }
export IMAGE_TAG="$tag"
dc="docker compose -f docker-compose.prod.yml"

pull=("$@")
for s in "$@"; do [ "$s" = backend ] && pull+=(migrate); done
$dc pull --quiet "${pull[@]}"

# backend depends on migrate (completed successfully), so migrations run first.
$dc up -d --no-build --wait --wait-timeout 180 "$@"

docker image prune -f >/dev/null   # dangling only: other apps share this daemon
$dc ps
