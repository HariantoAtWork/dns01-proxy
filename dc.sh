#!/usr/bin/env bash
# Docker Compose helpers for dns01-proxy (replaces root package.json scripts).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

usage() {
  cat <<'EOF'
Usage: ./dc.sh <command>

  build              Build local image (_build.yml)
  push               Multi-arch build and push (_push.yml)
  up                 Start stack (docker compose up -d)
  down               Stop stack
  restart            down + up
  logs               Follow dns01-proxy logs

  dev                Hot-reload Nuxt (_dev.yml)
  dev-down           Stop _dev.yml
  dev-restart        dev-down + dev

  vps                Bind :53 to PUBLIC_IP (_vps.yml)
  vps-down           Stop vps compose
  vps-restart        vps-down + vps

  list-txt           bun script/list-txt.ts
  generate-password  bun script/generate-password.ts [length]

PUBLIC_IP for vps* defaults to the host IPv4 from `ip route get 1.1.1.1`.
EOF
}

public_ip() {
  if [[ -n "${PUBLIC_IP:-}" ]]; then
    printf '%s' "$PUBLIC_IP"
    return
  fi
  ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p'
}

vps_compose() {
  local ip
  ip="$(public_ip)"
  if [[ -z "$ip" ]]; then
    echo "dc.sh: could not detect PUBLIC_IP; set PUBLIC_IP=…" >&2
    exit 1
  fi
  local -a args=(-f docker-compose.yml)
  if [[ -f docker-compose.override.yml ]]; then
    args+=(-f docker-compose.override.yml)
  fi
  args+=(-f _vps.yml)
  PUBLIC_IP="$ip" docker compose "${args[@]}" "$@"
}

cmd="${1:-}"
if [[ -z "$cmd" || "$cmd" == "-h" || "$cmd" == "--help" || "$cmd" == "help" ]]; then
  usage
  exit 0
fi
shift || true

case "$cmd" in
  build)
    docker compose -f _build.yml build "$@"
    ;;
  push)
    docker compose -f _push.yml build --no-cache --push "$@"
    ;;
  up)
    docker compose up -d "$@"
    ;;
  down)
    docker compose down "$@"
    ;;
  restart)
    docker compose down "$@"
    docker compose up -d "$@"
    ;;
  logs)
    docker compose logs -f dns01-proxy "$@"
    ;;
  dev)
    docker compose -f _dev.yml up -d --build "$@"
    ;;
  dev-down)
    docker compose -f _dev.yml down "$@"
    ;;
  dev-restart)
    docker compose -f _dev.yml down "$@"
    docker compose -f _dev.yml up -d --build "$@"
    ;;
  vps)
    vps_compose up -d "$@"
    ;;
  vps-down)
    vps_compose down "$@"
    ;;
  vps-restart)
    vps_compose down "$@"
    vps_compose up -d "$@"
    ;;
  list-txt)
    bun script/list-txt.ts "$@"
    ;;
  generate-password)
    bun script/generate-password.ts "$@"
    ;;
  *)
    echo "dc.sh: unknown command: $cmd" >&2
    usage >&2
    exit 1
    ;;
esac
