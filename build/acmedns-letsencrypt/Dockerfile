FROM alpine:3.19

# Install certbot and dependencies
RUN apk add --no-cache \
    certbot \
    python3 \
    py3-pip \
    py3-requests \
    bash \
    tzdata \
    && rm -rf /var/cache/apk/*

# Create necessary directories
RUN mkdir -p /config /scripts /var/log/certbot

# Copy scripts from build directory
COPY build/acme-dns-auth.py /config/acme-dns-auth.py
COPY build/entrypoint.sh /scripts/entrypoint.sh
COPY build/renew.sh /scripts/renew.sh

# Make scripts executable
RUN chmod +x /config/acme-dns-auth.py \
    /scripts/entrypoint.sh \
    /scripts/renew.sh

# Set timezone (optional, adjust as needed)
ENV TZ=UTC

# Health check
HEALTHCHECK --interval=12h --timeout=30s --start-period=10s --retries=3 \
    CMD certbot certificates || exit 1

ENTRYPOINT ["/scripts/entrypoint.sh"]
