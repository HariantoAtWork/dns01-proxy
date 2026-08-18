#!/bin/bash
set -e

echo "=== Let's Encrypt Auto-Renew Container ==="
echo "Starting at: $(date)"
echo ""

# Load environment variables
export ACMEDNS_URL="${ACMEDNS_URL:-https://auth.acme-dns.io}"
export STORAGE_PATH="${STORAGE_PATH:-/config/clientstorage.json}"
export LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-admin@example.com}"
export RENEW_INTERVAL="${RENEW_INTERVAL:-12}"

echo "Configuration:"
echo "  - ACMEDNS_URL: $ACMEDNS_URL"
echo "  - LETSENCRYPT_EMAIL: $LETSENCRYPT_EMAIL"
echo "  - RENEW_INTERVAL: Every ${RENEW_INTERVAL} hours"
echo ""

# Check if clientstorage.json exists
if [ ! -f "$STORAGE_PATH" ]; then
    echo "ERROR: clientstorage.json not found at $STORAGE_PATH"
    echo "Please mount your clientstorage.json file to /config/clientstorage.json"
    exit 1
fi

# Check if domains.txt exists
if [ ! -f /config/domains.txt ]; then
    echo "ERROR: domains.txt not found at /config/domains.txt"
    echo "Please mount your domains.txt file to /config/domains.txt"
    exit 1
fi

echo "=== Initial Certificate Generation ==="
echo ""

# Generate certificates for all domains on first run
while IFS= read -r line || [ -n "$line" ]; do
    # Skip empty lines and whole-line comments (# or ;)
    [[ -z "$line" || "$line" =~ ^[[:space:]]*[#;] ]] && continue
    
    # Parse domain and wildcard
    read -r domain wildcard <<< "$line"
    
    echo "Checking certificate for: $domain"
    
    # Check if certificate already exists and is valid
    if certbot certificates -d "$domain" 2>/dev/null | grep -q "Certificate Name: $domain"; then
        echo "  ✓ Certificate already exists for $domain"
    else
        echo "  → Generating new certificate for $domain"
        
        if [ -n "$wildcard" ]; then
            # Generate certificate for both domain and wildcard
            certbot certonly \
                --manual \
                --manual-auth-hook /config/acme-dns-auth.py \
                --preferred-challenges dns \
                --agree-tos \
                --no-eff-email \
                --non-interactive \
                -m "$LETSENCRYPT_EMAIL" \
                -d "$domain" \
                -d "$wildcard" || echo "  ✗ Failed to generate certificate for $domain"
        else
            # Generate certificate for domain only
            certbot certonly \
                --manual \
                --manual-auth-hook /config/acme-dns-auth.py \
                --preferred-challenges dns \
                --agree-tos \
                --no-eff-email \
                --non-interactive \
                -m "$LETSENCRYPT_EMAIL" \
                -d "$domain" || echo "  ✗ Failed to generate certificate for $domain"
        fi
    fi
    echo ""
done < /config/domains.txt

echo "=== Setting up Auto-Renewal Loop ==="
echo "Renewal will run every ${RENEW_INTERVAL} hours"
echo ""

echo "=== Container is Ready ==="
echo "Certificates will be automatically renewed every ${RENEW_INTERVAL} hours"
echo "Logs available at: /var/log/certbot/"
echo ""

# Calculate sleep time in seconds
SLEEP_SECONDS=$((RENEW_INTERVAL * 3600))

# Run renewal loop
while true; do
    echo "=== Renewal Check at $(date) ==="
    
    # Run renewal script
    /scripts/renew.sh
    
    # Cleanup old logs (if any exist)
    find /var/log/certbot -name '*.log' -mtime +30 -delete 2>/dev/null || true
    
    echo "Next renewal check in ${RENEW_INTERVAL} hours (at $(date -d "+${RENEW_INTERVAL} hours" 2>/dev/null || date -v+${RENEW_INTERVAL}H 2>/dev/null || echo "$(date)"))"
    echo ""
    
    # Sleep until next check
    sleep ${SLEEP_SECONDS}
done

