#!/bin/bash
set -e

echo "=== Certificate Renewal Check ==="
echo "Running at: $(date)"
echo ""

# Load environment variables
export ACMEDNS_URL="${ACMEDNS_URL:-https://auth.acme-dns.io}"
export STORAGE_PATH="${STORAGE_PATH:-/config/clientstorage.json}"

# Attempt to renew all certificates
certbot renew \
    --manual \
    --manual-auth-hook /config/acme-dns-auth.py \
    --preferred-challenges dns \
    --non-interactive \
    --quiet

RENEW_EXIT_CODE=$?

if [ $RENEW_EXIT_CODE -eq 0 ]; then
    echo "✓ Certificate renewal check completed successfully"
else
    echo "✗ Certificate renewal check failed with exit code: $RENEW_EXIT_CODE"
fi

echo "Completed at: $(date)"
echo ""

