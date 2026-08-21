# Build Directory

This directory contains files that are copied into the Docker image during the build process.

## Files

- **`domains.py`** - Shared domain logic for wildcard expansion and storage lookup
  - `expand_line()` — adds implied parent wildcards, then canonicalises SAN order
  - `line_apex()` / `cert-name` — shortest apex on the line (order does not matter)
  - `storage_candidates()` / `find_account()` — parent-walk in `clientstorage.json`; skips auth.acme-dns.io rows when `ACMEDNS_URL` is this stack
  - CLI: `python3 /config/domains.py expand|cert-name name …`

- **`domains_test.py`** - Unit tests for `domains.py` (`python3 domains_test.py`)

- **`acme-dns-auth.py`** - Python hook script for acme-dns DNS-01 challenge
  - Handles communication with acme-dns server(s)
  - Updates TXT records for domain validation
  - Uses parent-walk lookup from `domains.py`
  - Supports `clientstorage.json` format with `server_url` field

- **`entrypoint.sh`** - Container entrypoint script
  - Validates configuration files on startup
  - Expands each `domains.txt` line, then issues one certificate per line
  - Sets up renewal loop (`RENEW_INTERVAL`)

- **`renew.sh`** - Certificate renewal script
  - Renews existing certificates within 30 days of expiry
  - Uses the same auth hook as initial issuance

## Notes

- These files are copied into the Docker image at build time
- After modifying any file in this directory, rebuild the image:
  ```bash
  docker compose up -d --build acmedns-letsencrypt
  ```
