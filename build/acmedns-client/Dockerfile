# oven/bun:1.4.0 is not published on Docker Hub yet.
# Official images that ship Bun 1.4.0 are canary / canary-slim (digests pin that version).
FROM oven/bun:canary@sha256:c222acfa0d1a3eec44899f7dcd428dad1088b61c125f233d664459bb73cfc773 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run build

FROM oven/bun:canary-slim@sha256:713dd3a167f37db59eead6c67b0fedfe4763abf4d43236e2badc1d8cd446808b AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000
COPY --from=build /app/.output .output
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]
