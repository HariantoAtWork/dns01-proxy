# Seed templates

Copied into `$ACMEDNS_DATA_ROOT` on first start when the live file is missing.

| Seed path | Live destination |
| --- | --- |
| `server/config.cfg` | `$ACMEDNS_DATA_ROOT/server/config.cfg` (production / Docker) |
| `server/config.dev.cfg` | same live path when `bun run dev` (via `acmeDnsDefaultConfig`) |
| `client/clientstorage.json` | `$ACMEDNS_DATA_ROOT/client/clientstorage.json` |
| `client/domains.txt` | `$ACMEDNS_DATA_ROOT/client/domains.txt` |
| `client/cert-settings.json` | `$ACMEDNS_DATA_ROOT/client/cert-settings.json` |

`backup/` is created empty. Let's Encrypt PEMs are not seeded — they are issued into `$ACMEDNS_LETSENCRYPT_DIR`.

Edit these templates to change defaults for new installs. Existing live files are never overwritten.
