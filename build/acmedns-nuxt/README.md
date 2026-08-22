# acme-dns (Nuxt / Node)

Wire-compatible Node port of [acme-dns](https://github.com/acme-dns/acme-dns): authoritative DNS on `:53` plus HTTP `POST /register`, `POST /update`, and `GET /health`.

Uses the same SQLite schema and `config.cfg` layout as [`../acmedns-server`](../acmedns-server) (100 rolling TXT slots), so Synology volumes can be reused.

## Local develop

```bash
bun install
ACME_DNS_CONFIG=./config/config.cfg bun run dev
```

Defaults in `config/config.cfg` bind DNS to `127.0.0.1:15353` and SQLite under `.data/`.

```bash
curl -sS -X POST http://127.0.0.1:3000/register
curl -sS http://127.0.0.1:3000/health
dig @127.0.0.1 -p 15353 TXT <subdomain>.auth.example.test +short
```

## Docker

Image listens on **80** (HTTP API) and **53** TCP/UDP (DNS). Mount:

- `/etc/acme-dns` → `config.cfg`
- `/var/lib/acme-dns` → SQLite DB

Compose gives this service the network alias `acmedns-server` so existing clients keep `ACMEDNS_URL=http://acmedns-server`.
