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
ACME_DNS_CONFIG=./config/config.cfg bun run dev
```

UI + API on `http://127.0.0.1:3000`. DNS defaults to `127.0.0.1:15353` via `config/config.cfg`.

```bash
curl -sS -X POST http://127.0.0.1:3000/register
curl -sS http://127.0.0.1:3000/health
dig @127.0.0.1 -p 15353 TXT <subdomain>.auth.example.test +short
```

Local ACME register/update from the UI plugin calls host utils **in-process** (no HTTP hop) when `ACMEDNS_URL` points at localhost / `acmedns-server`.

## Docker

Image listens on **80** (UI + HTTP API, `NITRO_PORT=80`) and **53** TCP/UDP (DNS). Mount:

- `/etc/acme-dns` → `config.cfg`
- `/var/lib/acme-dns` → SQLite DB
- `/app/config` → clientstorage
- `/etc/letsencrypt` → PEMs
- `/config/host` → `domains.txt`
