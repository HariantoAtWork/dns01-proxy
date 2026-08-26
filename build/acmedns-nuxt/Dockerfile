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
ENV ACMEDNS_DATA_ROOT=/var/lib/acmedns-stack
ENV ACMEDNS_LETSENCRYPT_DIR=/etc/letsencrypt
COPY --from=build /app/.output .output
COPY --from=build /app/seed ./seed
EXPOSE 53 80 443
EXPOSE 53/udp
CMD ["/bin/sh", "-c", "set -e; root=\"${ACMEDNS_DATA_ROOT:?ACMEDNS_DATA_ROOT is required}\"; le=\"${ACMEDNS_LETSENCRYPT_DIR:?ACMEDNS_LETSENCRYPT_DIR is required}\"; mkdir -p \"$root/server\" \"$root/client\" \"$root/backup\" \"$le\"; file=\"$root/client/clientstorage.json\"; if [ ! -s \"$file\" ]; then echo '{}' > \"$file\"; fi; exec bun .output/server/index.mjs"]
