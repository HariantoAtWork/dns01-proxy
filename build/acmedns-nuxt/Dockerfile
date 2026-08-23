# oven/bun:1.4.0 is not published on Docker Hub yet.
# Official images that ship Bun 1.4.0 are canary / canary-slim.
# Install and Nuxt build run on the host CPU. QEMU amd64 on Apple Silicon
# crashes Bun (SIGILL). The Nitro output is JS; only the runner is per-arch.
FROM --platform=$BUILDPLATFORM oven/bun:canary-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM --platform=$BUILDPLATFORM deps AS build
COPY . .
RUN bun run build

FROM oven/bun:canary-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NUXT_ACME_DNS_CONFIG=/etc/acme-dns/config.cfg
ENV CLIENTSTORAGE_DATA=/app/config/clientstorage.json
ENV NUXT_APPLICATIONS_DATA_ROOT=/app/data
ENV DOMAINS_FILE=/config/host/domains.txt
ENV CERTBOT_CONFIG_DIR=/etc/letsencrypt
COPY --from=build /app/.output .output
EXPOSE 53 80 443
EXPOSE 53/udp
CMD ["/bin/sh", "-c", "set -e; file=\"${CLIENTSTORAGE_DATA:?CLIENTSTORAGE_DATA is required}\"; mkdir -p \"$(dirname \"$file\")\" /config/host /etc/letsencrypt /app/data; if [ ! -s \"$file\" ]; then echo '{}' > \"$file\"; fi; exec bun .output/server/index.mjs"]
