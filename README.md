# ACME DNS stack

One container. DNS-01 certificates without giving Let's Encrypt (or anyone) write access to your real DNS.

| Service | What it does |
| --- | --- |
| `acmedns-nuxt` | Nuxt/Node [acme-dns](https://github.com/acme-dns/acme-dns) on `:53` **plus** operator UI, clientstorage, and ACME issue/renew (client lives as `plugins/client`) |

`build/acmedns-server` (Go) and `build/acmedns-client` stay in the tree as reference/rollback. Runtime compose no longer starts a separate client service.

```mermaid
flowchart LR
  UI[acmedns-nuxt UI] -->|in-process /update| API[acmedns-nuxt API]
  UI -->|reads/writes| CS[clientstorage.json]
  UI -->|reads/writes| Domains[domains.txt]
  UI -->|writes PEMs| Certs[letsencrypt volume live/]
  PubDNS[Lets Encrypt] -->|DNS-01 query :53| API
```

## Certificates in the client

Edit `domains.txt` on the host (`/var/lib/acmedns-stack/client/domains.txt`) or in the **Certs** UI. **Save** validates format only. **Apply** runs ACME (DNS-01 via acme-dns).

- **Production** (default) writes `/etc/letsencrypt/live/<cert-name>/`
- **Staging** writes `/etc/letsencrypt/staging/<cert-name>/` and never touches `live/`
- A renew timer refreshes **production** certs within ~30 days of expiry
- Removing a line from `domains.txt` leaves PEMs on disk (orphans). Use **Trash** → Undo or permanent delete

Consumers bind the same Certbot-style paths:

```yaml
volumes:
  - ./data/letsencrypt:/etc/letsencrypt:ro
  # or: letsencrypt:/etc/letsencrypt:ro
```

Upstream acme-dns only keeps two TXT records per account. This stack’s Nuxt server keeps **100 rolling TXT slots** (same as the vendored Go tree). Rebuild `acmedns-nuxt` when issuing many SANs on one account.

`domains.txt` expands nested wildcards (implied parent wildcards). Line order does not matter — shortest apex is the cert-name. Register the line apex in the UI; the issuer walks parent keys in `clientstorage.json`.

## Ports

### `acmedns-nuxt`

| Container | Host | Notes |
| --- | --- | --- |
| `53/tcp` | `53` | DNS. Let's Encrypt hits this. |
| `53/udp` | `53` | Same. |
| `80/tcp` | `8080` | UI + register/update API (always). |
| `443/tcp` | `8443` | Same API over HTTPS when `api.tls = "cert"`. |

DNS has to be public; keep the UI behind your LAN / tunnel.

This house’s router DMZ is the Synology, so public `:53` never reaches a Mac. **Test real Let's Encrypt issuance on the NAS**, not on a laptop. See [`.wiki/Test-on-Synology.md`](.wiki/Test-on-Synology.md). Working NAS runbook: [`.wiki/Working-Synology-setup.md`](.wiki/Working-Synology-setup.md).

## Quick start

```bash
cp .env.example .env
cp docker-compose.yml.example docker-compose.yml
cp docker-compose.override.yml.example docker-compose.override.yml
docker compose up -d --build
```

Docker seeds on first start under `/var/lib/acmedns-stack`:

- `server/config.cfg` + `server/acme-dns.db`
- `client/domains.txt`, `client/clientstorage.json`, `client/cert-settings.json`
- `backup/` for JSON backups
- PEMs under `/etc/letsencrypt` (host `./data/letsencrypt` or named volume)

1. `config.cfg` — your auth hostname, NS, admin, public IP.
2. `domains.txt` — one certificate per line. Edit in the Certs UI or on disk; Save validates; Apply issues. Example: `mdstn.com *.mdstn.com *.oib.mdstn.com *.admin.mdstn.com`. `#` and `;` start comments.
3. `.env` — at least `LETSENCRYPT_EMAIL`. For grouped SAN certs, rebuild `acmedns-nuxt` from this tree (100 TXT slots).
4. CNAME `_acme-challenge.<apex>` → `fulldomain` in `clientstorage.json`. Nested zones CNAME to `_acme-challenge.<apex>`.
5. You need the `cloudflared` Docker network (see `docker-compose.override.yml.example`).

Manual migrate from older layouts: move server config/DB into `/var/lib/acmedns-stack/server/`, client files into `…/client/`, backups into `…/backup/`, and PEMs into the letsencrypt mount.

## Config

| File | |
| --- | --- |
| `.env` | Copy from `.env.example`. Gitignored. |
| `docker-compose.yml` | Copy from `docker-compose.yml.example`. Gitignored. |
| `docker-compose.override.yml` | Copy from `docker-compose.override.yml.example`. Gitignored. |
| `/var/lib/acmedns-stack/server/config.cfg` | Listen address, zone, API, SQLite path. |
| `/var/lib/acmedns-stack/client/domains.txt` | What to issue (also edited in the Certs UI). |
| `/var/lib/acmedns-stack/client/clientstorage.json` | acme-dns logins. Not Let's Encrypt. |

### Environment (`.env` → `acmedns-nuxt`)

| Variable | Example | |
| --- | --- | --- |
| `ACMEDNS_DATA_ROOT` | `/var/lib/acmedns-stack` | Flat tree: `server/`, `client/`, `backup/`. Local dev uses `.data`. |
| `ACMEDNS_LETSENCRYPT_DIR` | `/etc/letsencrypt` | PEM tree. Local dev uses `.data/letsencrypt`. |
| `ACMEDNS_URL` | `https://auth.example.org` | Public identity for register/update. Loopback or a host matching `config.cfg` `domain` still runs in-process; that public URL is what gets stored. Compose also uses this as the Register form default unless `NUXT_PUBLIC_DEFAULT_ACMEDNS_URL` is set. |
| `LETSENCRYPT_EMAIL` | `admin@example.com` | ACME account contact. |
| `RENEW_INTERVAL` | `12` | Hours between production renew checks. |
| `CERTS_ACME_DISABLED` | `false` | Set `true` to disable issue/renew (editor still works). |
| `TZ` | `UTC` | Clock. |

Set `ADMINISTRATOR_PASSWORD` to lock the UI behind username `admin`.

Backups live at `$ACMEDNS_DATA_ROOT/backup`.

## Volumes

| Host / volume | Inside the container |
| --- | --- |
| `/var/lib/acmedns-stack` | `/var/lib/acmedns-stack` (`server/`, `client/`, `backup/`) |
| `./data/letsencrypt` (or named `letsencrypt`) | `/etc/letsencrypt` (`live/`, `staging/`, `trash/`, `accounts/`) |

## Networks

Default compose network: single `acmedns-nuxt` service. UI and acme-dns API share the process. HTTP on `:80` is always on; set `api.tls = "cert"` in `config.cfg` to also serve HTTPS on `:443` (host `8443`).

| `config.cfg` `[api]` | Container | Host (compose) |
| --- | --- | --- |
| `tls = "none"` | HTTP `:80` | `8080` |
| `tls = "cert"`, `port = "443"` | HTTP `:80` + HTTPS `:443` | `8080` + `8443` |

`cloudflared` (external): attach the same service. Port 53 stays on the host, not the tunnel.

More on DNS-01 and DMZ: [`.wiki/Home.md`](.wiki/Home.md).

## Layout

```
docker-compose.yml.example
docker-compose.override.yml.example
.env.example
.wiki/
build/acmedns-nuxt/        # DNS + API + UI plugin (plugins/client)
build/acmedns-server/      # Go reference / rollback
build/acmedns-client/      # legacy standalone client (reference)
# Host: /var/lib/acmedns-stack + ./data/letsencrypt (compose)
# Local: build/acmedns-nuxt/.data/{server,client,backup,letsencrypt}
```
