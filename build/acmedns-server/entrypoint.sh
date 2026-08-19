#!/bin/sh
set -e

CONFIG_FILE=/etc/acme-dns/config.cfg
DEFAULT_CONFIG=/defaults/config.cfg

mkdir -p /etc/acme-dns /var/lib/acme-dns

if [ -d "$CONFIG_FILE" ]; then
    echo "ERROR: $CONFIG_FILE is a directory."
    echo "That happens when Docker bind-mounts a missing file. Remove data/acmedns-server/config/config.cfg and restart."
    exit 1
fi

if [ ! -s "$CONFIG_FILE" ]; then
    echo "No config.cfg on the volume. Writing the default to $CONFIG_FILE"
    cp "$DEFAULT_CONFIG" "$CONFIG_FILE"
    echo "Edit data/acmedns-server/config/config.cfg (hostname, NS, public IP), then restart."
fi

exec /root/acme-dns -c "$CONFIG_FILE" "$@"
