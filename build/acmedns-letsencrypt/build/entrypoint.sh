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

HOST_DIR=/config/host
DOMAINS_FILE="$HOST_DIR/domains.txt"
mkdir -p "$HOST_DIR"

if [ -d "$DOMAINS_FILE" ]; then
    echo "ERROR: $DOMAINS_FILE is a directory."
    echo "Docker does that when you bind-mount a missing file."
    echo "Remove data/acmedns-letsencrypt/domains.txt on the host and restart."
    exit 1
fi

if [ ! -s "$DOMAINS_FILE" ]; then
    echo "No domains.txt on the volume. Writing a starter file."
    cp /defaults/domains.txt "$DOMAINS_FILE"
    echo "Edit data/acmedns-letsencrypt/domains.txt, then restart."
fi

if [ -d "$STORAGE_PATH" ]; then
    echo "ERROR: $STORAGE_PATH is a directory."
    echo "Remove that path on the volume and restart."
    exit 1
fi

# Read-only mount: acmedns-client seeds clientstorage.json
for _ in 1 2 3 4 5 6 7 8 9 10; do
    [ -s "$STORAGE_PATH" ] && break
    echo "Waiting for clientstorage.json..."
    sleep 1
done

if [ ! -s "$STORAGE_PATH" ]; then
    echo "ERROR: clientstorage.json not found at $STORAGE_PATH"
    echo "This mount is read-only. Start acmedns-client so it can create the file."
    exit 1
fi

is_valid_name() {
    local name="$1"
    local stars apex
    stars="${name//[^*]/}"
    if [ "${#stars}" -gt 1 ]; then
        echo "  ✗ Invalid name $name (more than one wildcard)"
        return 1
    fi
    if [ "${name#\*.}" != "$name" ]; then
        apex="${name#\*.}"
    else
        apex="$name"
    fi
    if [[ ! "$apex" =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$ ]]; then
        echo "  ✗ Invalid domain $name"
        return 1
    fi
    return 0
}

issue_certificate() {
    local cert_name="$1"
    shift
    local -a names=("$@")
    local -a dash_d=()
    local name

    echo "Checking certificate for: $cert_name (${names[*]})"

    for name in "${names[@]}"; do
        dash_d+=(-d "$name")
    done

    echo "  → Issuing or expanding certificate $cert_name"
    certbot certonly \
        --manual \
        --manual-auth-hook /config/acme-dns-auth.py \
        --preferred-challenges dns \
        --agree-tos \
        --no-eff-email \
        --non-interactive \
        --expand \
        --cert-name "$cert_name" \
        -m "$LETSENCRYPT_EMAIL" \
        "${dash_d[@]}" || echo "  ✗ Failed to generate certificate for $cert_name"
}

echo "=== Initial Certificate Generation ==="
echo ""

while IFS= read -r line || [ -n "$line" ]; do
    comment_re='^[[:space:]]*[#;]'
    [[ -z "$line" || "$line" =~ $comment_re ]] && continue

    line="${line%%#*}"
    line="${line//,/ }"
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue

    read -r -a names <<< "$line"
    if [ "${#names[@]}" -eq 0 ]; then
        continue
    fi

    valid=()
    for name in "${names[@]}"; do
        if is_valid_name "$name"; then
            valid+=("$name")
        fi
    done
    if [ "${#valid[@]}" -eq 0 ]; then
        continue
    fi

    first="${valid[0]}"
    cert_name="${first#\*.}"
    issue_certificate "$cert_name" "${valid[@]}"
    echo ""
done < "$DOMAINS_FILE"

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
