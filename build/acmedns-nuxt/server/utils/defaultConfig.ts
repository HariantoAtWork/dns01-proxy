/** Embedded fallback if seed/config.cfg is missing (production-oriented). */
export const DEFAULT_ACME_DNS_CONFIG_TEXT = `[general]
listen = "0.0.0.0:53"
protocol = "both"
domain = "auth.example.org"
nsname = "auth.example.org"
nsadmin = "admin.example.org"
records = [
    "auth.example.org. A 198.51.100.1",
    "auth.example.org. NS auth.example.org.",
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
# tls_cert_fullchain = "/etc/letsencrypt/live/auth.example.org/fullchain.pem"
# tls_cert_privkey = "/etc/letsencrypt/live/auth.example.org/privkey.pem"
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
