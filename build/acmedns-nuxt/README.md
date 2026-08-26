# acme-dns (Nuxt / Node) + operator UI

Single Nuxt 4 app that combines:

- **Host** — authoritative DNS on `:53`, SQLite, `POST /register`, `POST /update`, `GET /health`
- **Plugin** [`plugins/client`](./plugins/client) — operator UI, `/api/*`, clientstorage, certs, backups (same pattern as your ghost-blog local plugins)

Wire-compatible with the Go [`../acmedns-server`](../acmedns-server) data layout (100 TXT slots).

## Layout

```
plugins/client/
  index.ts                 # defineNuxtModule
  runtime/
    plugin.ts              # defineNuxtPlugin
    server/api|utils|…     # client APIs
    pages|components|…     # UI
server/                    # acme-dns DNS + HTTP only
```

Register locally with:

```ts
modules: ['./plugins/client']
```

## Local develop

```bash
bun install
bun run dev
```

Uses `.data/{server,client,backup,letsencrypt}` (`ACMEDNS_DATA_ROOT=.data`). First start copies templates from [`seed/`](./seed) (see `seed/README.md`). UI + API on `http://127.0.0.1:3000`. DNS defaults to `127.0.0.1:15353` via `.data/server/config.cfg` (from `seed/server/config.dev.cfg`).

Edit files under `seed/` to change defaults for **new** installs; live files under `.data/` / `/var/lib/acmedns-stack` are never overwritten.

Production Docker reads `[api]` from `config.cfg`:

- Always HTTP on port `80` (`NITRO_PORT` / `PORT` override; with `tls = "none"`, `api.port` is the HTTP port — default `80`)
- `tls = "cert"` → also HTTPS on `api.port` (default `443`) using `tls_cert_fullchain` + `tls_cert_privkey`

```bash
curl -sS -X POST http://127.0.0.1:3000/register
curl -sS http://127.0.0.1:3000/health
dig @127.0.0.1 -p 15353 TXT <subdomain>.auth.example.test +short
```

Local ACME register/update from the UI plugin calls host utils **in-process** (no HTTP hop) when `ACMEDNS_URL` points at localhost / `acmedns-server`.

## Docker

Image always listens on **80** (HTTP). With `api.tls = "cert"` it also listens on **443** (HTTPS), plus **53** TCP/UDP (DNS).

Path ENV (only these for storage):

- `ACMEDNS_DATA_ROOT=/var/lib/acmedns-stack` → `server/`, `client/`, `backup/`
- `ACMEDNS_LETSENCRYPT_DIR=/etc/letsencrypt`

Mount:

- `/var/lib/acmedns-stack` → stack data
- `./data/letsencrypt` or named `letsencrypt` → `/etc/letsencrypt`
