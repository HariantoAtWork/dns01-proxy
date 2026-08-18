# Build Directory

This directory contains files that are copied into the Docker image during the build process.

## Files

- **`acme-dns-auth.py`** - Python hook script for acme-dns DNS-01 challenge
  - Handles communication with acme-dns server(s)
  - Updates TXT records for domain validation
  - Supports `clientstorage.json` format with `server_url` field
  - Can work with multiple acme-dns servers in the same file:
    - Self-hosted: `http://auth.mizu.work`
    - Public service: `https://auth.acme-dns.io`

- **`entrypoint.sh`** - Container entrypoint script
  - Validates configuration files on startup
  - Generates certificates for all domains in `domains.txt` if they don't exist
  - Sets up cron job for automatic renewal
  - Starts cron daemon in foreground

- **`renew.sh`** - Certificate renewal script
  - Executed by cron every N hours (configured via `RENEW_INTERVAL`)
  - Checks all certificates and renews those within 30 days of expiry
  - Logs renewal attempts to `/var/log/certbot/renew.log`

## Notes

- These files are copied into the Docker image at build time
- Do not modify these files directly in a running container
- After modifying any file in this directory, rebuild the image:
  ```bash
  docker-compose up -d --build
  ```

