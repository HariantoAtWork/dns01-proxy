# ACME DNS stack

Three containers. One compose file. Certificates via DNS-01 without giving Let's Encrypt (or anyone) write access to your real DNS.

| Service | What it does |
| --- | --- |
| `acmedns-server` | [acme-dns](https://github.com/acme-dns/acme-dns) — a tiny DNS server plus an HTTP API for TXT updates |
| `acmedns-client` | Nuxt 4 UI in `build/acmedns-client`. Edits `clientstorage.json` in the browser |
| `acmedns-letsencrypt` | Certbot in a loop. Custom hook, not the plugin |

```mermaid
flowchart LR
  LE[acmedns-letsencrypt] -->|HTTP /update| API[acmedns-server :80]
  LE -->|reads| CS[clientstorage.json]
  UI[acmedns-client] -->|reads/writes| CS
  PubDNS[Lets Encrypt] -->|DNS-01 query :53| API
  LE -->|writes certs| Certs[letsencrypt volume]
```

## Why I didn't just use the plugin

There *is* a Certbot plugin: [`certbot-dns-acmedns`](https://pypi.org/project/certbot-dns-acmedns/). It is not from Let's Encrypt. Official plugins look like `certbot-dns-cloudflare`. This one is third-party, wants a credentials INI *and* a JSON file, and it will not register the acme-dns accounts for you.

That JSON is the same idea as `clientstorage.json`. [acme-dns-client](https://github.com/acme-dns/acme-dns-client) calls it that. Joohoi's hook calls it `acmedns.json`. cert-manager uses the same shape. Let's Encrypt never touches any of it. They only look up `_acme-challenge` in public DNS. Certbot's own stuff lives under `/etc/letsencrypt/`.

I got tired of the plugin. So `acmedns-letsencrypt` is just Certbot `--manual` with `acme-dns-auth.py`, reading the JSON from a shared volume, talking to `acmedns-server`, and walking `domains.txt`. Same challenge, less ceremony.

Upstream acme-dns only keeps two TXT records per account, enough for `example.com` plus `*.example.com`. Grouped SAN certs need more. This stack vendors acme-dns in `build/acmedns-server` with **100 rolling TXT slots** per account (Let's Encrypt's name cap). Existing accounts are padded on start. Rebuild `acmedns-server` from this tree when issuing many SANs on one account.

The public service [auth.acme-dns.io](https://auth.acme-dns.io) is still usable. It is stock acme-dns, so **one account = two tokens**: `mdstn.com *.mdstn.com` works; adding `*.oib.mdstn.com` on that same UUID does not. Extra nested names need their own acme-dns.io account and their own CNAME (no chain to the apex UUID). In this stack, if `ACMEDNS_URL` is your server, the Certbot hook **skips** `auth.acme-dns.io` rows in `clientstorage.json` and walks to a local apex account — mix the two only if you know which Certbot is talking.

`acmedns-letsencrypt` expands each `domains.txt` line before Certbot runs: nested wildcards imply parent wildcards on the cert (e.g. `*.fail.label.parent.example.com` also requests `*.parent.example.com`). Line order does not matter — the shortest apex becomes the Certbot cert-name, and SANs are logged apex-first. The auth hook walks parent hostnames in `clientstorage.json`, so one registration for the line apex (e.g. `mdstn.com`) covers nested names when `_acme-challenge` CNAMEs chain to the same acme-dns account.

## Ports

### `acmedns-server`

| Container | Host | Notes |
| --- | --- | --- |
| `53/tcp` | `53` | DNS. Let's Encrypt hits this. |
| `53/udp` | `53` | Same. |
| `80/tcp` | not published | Register/update API. Compose DNS name `http://acmedns-server`, or cloudflared. |
| `443/tcp` | not published | Image exposes it. Unused while `tls = "none"`. |

Leave `:80` and `:443` off the host. DNS has to be public; the API does not.

This house’s router DMZ is the Synology, so public `:53` never reaches a Mac. **Test real Let's Encrypt issuance on the NAS**, not on a laptop. The UI and the Certbot hook can still look fine on the Mac; DNS-01 will not. See [`.wiki/Test-on-Synology.md`](.wiki/Test-on-Synology.md). The values that actually issued on the NAS: [`.wiki/Working-Synology-setup.md`](.wiki/Working-Synology-setup.md).

### `acmedns-client`

| Container | Host | Notes |
| --- | --- | --- |
| `3000/tcp` | `82` | UI at `http://localhost:82`. Also on cloudflared if you want a hostname. |

### `acmedns-letsencrypt`

Nothing published. It only talks out: Let's Encrypt, and `http://acmedns-server`.

## Quick start

```bash
cp .env.example .env
cp docker-compose.yml.example docker-compose.yml
cp docker-compose.override.yml.example docker-compose.override.yml
docker compose up -d --build
```

Docker creates `data/` for you. On first start the containers write:

- `data/acmedns-server/config/config.cfg`
- `data/acmedns-letsencrypt/domains.txt`
- `clientstorage.json` on the `acmedns-client` volume (`{}` if empty), written by `acmedns-client`

Edit those, then restart. `domains.txt` ships as comments only so Certbot does not try `example.com` by accident.

If an old compose file already bind-mounted a missing `domains.txt`, Docker may have created a *directory* with that name. Remove it (`rm -rf data/acmedns-letsencrypt/domains.txt`) and start again.

1. `config.cfg` — your auth hostname, NS, admin, public IP.
2. `domains.txt` — one certificate per line. Space- or comma-separated names; order on the line does not matter. Register only the line apex in acmedns-client. Nested `*.zone.example.com` entries imply parent wildcards automatically; restart `acmedns-letsencrypt` after edits. Example: `mdstn.com *.mdstn.com *.oib.mdstn.com *.admin.mdstn.com`. `#` and `;` start comments.
3. `.env` — at least `LETSENCRYPT_EMAIL`. For grouped SAN certs, rebuild `acmedns-server` from this tree (100 TXT slots, pad on start).
4. CNAME `_acme-challenge.<apex>` → `fulldomain` in `clientstorage.json`. Nested zones CNAME to `_acme-challenge.<apex>` (proven for `mdstn.com`: `oib` / `otherinbox` / `admin` chain to the apex challenge). See [`.wiki/Working-Synology-setup.md`](.wiki/Working-Synology-setup.md).
5. You need the `cloudflared` Docker network (see `docker-compose.override.yml.example`).

## Config

| File | |
| --- | --- |
| `.env` | Copy from `.env.example`. Gitignored. |
| `docker-compose.yml` | Copy from `docker-compose.yml.example`. Gitignored. |
| `docker-compose.override.yml` | Copy from `docker-compose.override.yml.example`. Gitignored. Edit for your tunnel / networks. |
| `data/acmedns-server/config/config.cfg` | Listen address, zone, API. Example has `tls = "none"` on port 80. |
| `data/acmedns-letsencrypt/domains.txt` | What Certbot should issue. |
| `clientstorage.json` (volume `acmedns-client`) | acme-dns logins. Not Let's Encrypt. |

### Environment (`.env` → `acmedns-letsencrypt`)

| Variable | Example | |
| --- | --- | --- |
| `ACMEDNS_URL` | `http://acmedns-server` | API for new registrations. Old JSON entries may still have their own `server_url`. |
| `STORAGE_PATH` | `/config/acmedns-client/clientstorage.json` | Where the hook looks for the JSON. |
| `LETSENCRYPT_EMAIL` | `admin@example.com` | Let's Encrypt contact. |
| `RENEW_INTERVAL` | `12` | Hours between renew checks. |
| `TZ` | `UTC` | Clock. |

`acmedns-client` also reads `ACMEDNS_URL` (and `NUXT_PUBLIC_DEFAULT_ACMEDNS_URL`) so Nitro can reach the API. Server is all `config.cfg`.

Set `ADMINISTRATOR_PASSWORD` in `.env` to lock the Nuxt UI and its APIs behind username `admin`. Leave it empty for open access.

`NUXT_APPLICATIONS_DATA_ROOT` is the parent data directory for the Nuxt client (server-only). Compose defaults it to `/app/data` on the `acmedns-client-data` volume. Live JSON stays at `/app/config/clientstorage.json` on the `acmedns-client` volume. Backups are written to `/app/data/acmedns-client/backups`. Leave the env empty locally and the app uses the live storage directory.

The Backup page can dump the whole `clientstorage.json` or one hostname, list those files, restore (with overwrite confirm), and delete copies. Restore of a domain merges that hostname; a full restore replaces the live file. The same page can download the live `CLIENTSTORAGE_DATA` file and upload a `clientstorage.json` to replace it.

## Volumes

| Volume | Who | Inside the container |
| --- | --- | --- |
| `letsencrypt` | `acmedns-letsencrypt` rw, `acmedns-server` ro | `/etc/letsencrypt` |
| `acmedns-client` | `acmedns-client` rw, `acmedns-letsencrypt` ro | `/app/config` and `/config/acmedns-client` |
| `acmedns-client-data` | `acmedns-client` rw | `/app/data` |
| `letsencrypt-logs` | `acmedns-letsencrypt` | `/var/log/certbot` |
| `./data/acmedns-server/config` | `acmedns-server` | `/etc/acme-dns` — `config.cfg` is created here if missing |
| `./data/acmedns-server/data` | `acmedns-server` | `/var/lib/acme-dns` |
| `./data/acmedns-letsencrypt` | `acmedns-letsencrypt` | `/config/host` — `domains.txt` is created here if missing |

If another stack needs the same certs or JSON, mark these volumes `external: true` over there.

## Networks

Default compose network: all three. Certbot reaches the server as `http://acmedns-server`.

`cloudflared` (external): server and client only. Port 53 stays on the host, not the tunnel.

Why DNS-01 needs public 53, why hostnames do not split that port, and why the tunnel cannot carry Let's Encrypt lookups: [`.wiki/Home.md`](.wiki/Home.md). Where to run Compose while DMZ points at the NAS: [`.wiki/Test-on-Synology.md`](.wiki/Test-on-Synology.md). Working NAS runbook (Cloudflare, reverse proxy, `config.cfg`): [`.wiki/Working-Synology-setup.md`](.wiki/Working-Synology-setup.md).

## Layout

```
docker-compose.yml.example
docker-compose.override.yml.example
.env.example
.wiki/                     # public DNS, port 53, DMZ, cloudflared
build/acmedns-server/
build/acmedns-client/
build/acmedns-letsencrypt/
data/                      # gitignored
```
