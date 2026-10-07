# Seed templates

Copied into `$ACMEDNS_DATA_ROOT` on first start when the live file is missing.

| Seed template | Live destination |
| --- | --- |
| `server/config.cfg.template` | `$ACMEDNS_DATA_ROOT/server/config.cfg` (production / Docker) |
| `server/config.dev.cfg.template` | same live path when `bun run dev` (via `acmeDnsDefaultConfig`) |
| `server/config.tiny.cfg.template` | same when `NUXT_ACME_DNS_DEFAULT_CONFIG` points at it |
| `client/clientstorage.json` | `$ACMEDNS_DATA_ROOT/client/clientstorage.json` |
| `client/domains.txt` | `$ACMEDNS_DATA_ROOT/client/domains.txt` |
| `client/cert-settings.json` | `$ACMEDNS_DATA_ROOT/client/cert-settings.json` |

Server templates use `${APEX}`, `${AUTH_DOMAIN}`, and `${NSADMIN}`. DNS/auth zone keys use `${AUTH_DOMAIN}`; TLS cert paths use `${APEX}`.

`backup/` is created empty. Let's Encrypt PEMs are not seeded — they are issued into `$ACMEDNS_LETSENCRYPT_DIR`.

Edit templates to change defaults for new installs. Existing live files are never overwritten.
