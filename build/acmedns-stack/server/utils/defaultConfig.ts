/** Embedded fallback template if seed/server/config.cfg.template is missing. */
export const DEFAULT_ACME_DNS_CONFIG_TEMPLATE = `[general]
listen = "0.0.0.0:53"
protocol = "both"
domain = "${AUTH_DOMAIN}"
nsname = "${AUTH_DOMAIN}"
nsadmin = "${NSADMIN}"
records = [
    "${AUTH_DOMAIN}. A 198.51.100.1",
    "${AUTH_DOMAIN}. NS ${AUTH_DOMAIN}.",
]
debug = false

[database]
engine = "sqlite"
connection = "/var/lib/acmedns-stack/server/acme-dns.db"

[api]
ip = "0.0.0.0"
disable_registration = false
port = "80"
tls = "none"
# tls_cert_* — only used when tls = "cert". Cert is issued for the apex, not the auth zone.
tls_cert_fullchain = "/etc/letsencrypt/live/${APEX}/fullchain.pem"
tls_cert_privkey = "/etc/letsencrypt/live/${APEX}/privkey.pem"
corsorigins = [
    "*"
]
use_header = false
header_name = "X-Forwarded-For"

[logconfig]
loglevel = "info"
logtype = "stdout"
logformat = "text"
`

/** @deprecated use DEFAULT_ACME_DNS_CONFIG_TEMPLATE */
export const DEFAULT_ACME_DNS_CONFIG_TEXT = DEFAULT_ACME_DNS_CONFIG_TEMPLATE
