# acme-dns (Nuxt / Node) + operator UI

Single Nuxt 4 app that combines:

- **Host** — authoritative DNS on `:53`, SQLite, `POST /register`, `POST /update`, `GET /health`
- **Plugin** [`plugins/client`](./plugins/client) — operator UI, `/api/*`, clientstorage, certs, backups

## Layout

```
plugins/client/     # defineNuxtModule + runtime (UI, APIs)
server/             # acme-dns DNS + HTTP
seed/               # first-start templates → ACMEDNS_DATA_ROOT
  server/
  client/
```

Register locally with:

```ts
modules: ['./plugins/client']
```

## Local develop

From the repo root:

```bash
bun install --cwd src/dns01-proxy
bun run --cwd src/dns01-proxy dev
```

Or inside this package: `bun install && bun run dev`.

Same stack in Docker (`_dev.yml` from the repo root): `./dc.sh dev` — mounts this package, runs `bun run dev`, UI on `http://127.0.0.1:3000`, DNS published on `:15353` (`ACME_DNS_LISTEN=0.0.0.0`).

Uses `.data/{server,client,backup,letsencrypt}` (`ACMEDNS_DATA_ROOT=.data`). First start copies templates from [`seed/`](./seed/README.md). UI + API on `http://127.0.0.1:3000`. DNS defaults to `127.0.0.1:15353` via `.data/server/config.cfg` (from `seed/server/config.dev.cfg`).

Edit `seed/` for **new-install** defaults only; live `.data/` files are never overwritten.

Production Docker reads `[api]` from live `config.cfg`:

- Always HTTP on port `80` (`NITRO_PORT` / `PORT` override; with `tls = "none"`, `api.port` is the HTTP port)
- `tls = "cert"` → also HTTPS on `api.port` (default `443`) using `tls_cert_fullchain` + `tls_cert_privkey`

```bash
curl -sS -X POST http://127.0.0.1:3000/register
curl -sS http://127.0.0.1:3000/health
dig @127.0.0.1 -p 15353 TXT <subdomain>.auth.example.test +short
```

Local ACME register/update from the UI calls host utils **in-process** when `ACMEDNS_URL` points at localhost.

## Docker

Image listens on **80** (HTTP), optional **443** (HTTPS), plus **53** TCP/UDP (DNS).

Path ENV (only these for storage — no legacy aliases):

| ENV | Default |
| --- | --- |
| `ACMEDNS_DATA_ROOT` | `/var/lib/dns01-proxy` → `server/`, `client/`, `backup/` |
| `ACMEDNS_LETSENCRYPT_DIR` | `/etc/letsencrypt` |

Mounts (see repo `docker-compose.yml.example`):

- `./data/dns01-proxy` (or host `/var/lib/dns01-proxy`) → `/var/lib/dns01-proxy`
- `./data/letsencrypt` or named `letsencrypt` → `/etc/letsencrypt`

`Dockerfile` is for local/native builds; `Dockerfile.platform` keeps `--platform=$BUILDPLATFORM` for multi-arch Hub pushes (`docker compose -f _push.yml`).
