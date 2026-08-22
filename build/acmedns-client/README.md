# ACME DNS client

Nuxt 4 UI for `clientstorage.json` and Let's Encrypt certificates (DNS-01 via acme-dns). Registers accounts, edits `domains.txt`, issues PEMs under `/etc/letsencrypt/live` (or `staging/`), and renews on a timer.

## Local

Requires Bun 1.4.0 (`bun --version`). Docker uses the official 1.4.0 canary images until `oven/bun:1.4.0` is published.

```bash
cp .env.example .env
bun install
bun run dev
bun test
```

UI: http://localhost:3000

`ACMEDNS_URL` is called from the Nuxt server, not the browser. Inside Docker that is `http://acmedns-server`. On the host, set it to a reachable acme-dns API.

Storage defaults to `config/clientstorage.json`. Domains file defaults to `config/host/domains.txt` (Compose: `/config/host/domains.txt`). Cert tree defaults to `/etc/letsencrypt`.

Set `NUXT_APPLICATIONS_DATA_ROOT` for the parent data directory (server-only). Backups are written to `{NUXT_APPLICATIONS_DATA_ROOT}/acmedns-client/backups` (created if missing). Leave it empty to use the live storage directory (`data/` locally). Live JSON stays at `CLIENTSTORAGE_DATA`. The Backup page can also download that live file or upload a `clientstorage.json` to replace it.

Set `ADMINISTRATOR_PASSWORD` to lock the UI and APIs behind username `admin`. Leave it empty (the default) for open access.

Set `CERTS_ACME_ENABLED=false` to keep the domains editor without calling Let's Encrypt.

## Stack

Parent compose builds this image and serves it on http://localhost:82. Volume `acmedns-client` is `/app/config` (live JSON). Volume `acmedns-client-data` is `/app/data`. Named volume `letsencrypt` mounts at `/etc/letsencrypt` (rw). Host `./data/acmedns-letsencrypt` mounts at `/config/host` for `domains.txt`.
