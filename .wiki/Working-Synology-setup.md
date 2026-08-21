# Working Synology setup

This is the config that got DNS-01 certificates issuing on the Synology NAS — not on a Mac. For why the Mac cannot prove DNS-01, see [Test this stack on the Synology](Test-on-Synology.md). The router DMZ points at the NAS, so public port 53 lands here. If you run Compose on a laptop, the UI and the Certbot hook can look fine while Let's Encrypt still fails. Put this stack on the machine that actually owns `:53`.

What is proven so far: apex + one wildcard (`uti.email *.uti.email`), and a grouped SAN line for `mdstn.com` with nested wildcards. Nested challenge names CNAME to `_acme-challenge.mdstn.com`; that name CNAME to the acme-dns `fulldomain`. See the records below.

---

## The shape of the thing

Three jobs, three paths:

| Path | What talks | How it reaches the NAS |
| --- | --- | --- |
| DNS-01 | Let's Encrypt → `_acme-challenge` → your acme-dns zone | Public **UDP/TCP 53** on `84.86.220.240` (grey-cloud A, not the tunnel) |
| HTTP API | Certbot hook, Nuxt register/update | Synology Reverse Proxy → host `8080` → container `:80` |
| Tunnel (optional) | Browser UI / HTTPS hostnames | cloudflared — **HTTP only**. It does not carry port 53 |

Cloudflare orange-cloud on `auth.uti.email` is fine for a website. It is wrong for a nameserver. Keep the auth zone **DNS only**.

---

## 1. `config.cfg` (acme-dns)

File: `data/acmedns-server/config/config.cfg`

The important bits: listen on all interfaces for DNS, serve the `auth.uti.email` zone, expose the API on HTTP port 80 inside the container (TLS off — Synology terminates HTTPS), and publish A/NS glue that matches Cloudflare.

```cfg
[general]
# DNS interface. Note that systemd-resolved may reserve port 53 on 127.0.0.53
# In this case acme-dns will error out and you will need to define the listening interface
# for example: listen = "127.0.0.1:53"
listen = "0.0.0.0:53"
# protocol, "both", "both4", "both6", "udp", "udp4", "udp6" or "tcp", "tcp4", "tcp6"
protocol = "both"
# domain name to serve the requests off of
domain = "auth.uti.email"
# zone name server
nsname = "auth.uti.email"
# admin email address, where @ is substituted with .
nsadmin = "admin.harianto.dev"
# predefined records served in addition to the TXT
# (A/NS/SOA for the auth zone — not the ACME TXT slot count)
records = [
    # domain pointing to the public IP of your acme-dns server
    "auth.uti.email. A 84.86.220.240",
    #"auth.uti.email. CNAME 7864111e-97ff-44f3-9f81-f1faa48d297a.cfargotunnel.com.",
    # specify that auth.uti.email will resolve any *.auth.uti.email records
    "auth.uti.email. NS auth.uti.email.",
]
# debug messages from CORS etc
debug = false

[database]
# Database engine to use, sqlite or postgres (sqlite3 is still accepted)
engine = "sqlite"
# Connection string, filename for sqlite and postgres://$username:$password@$host/$db_name for postgres
# Please note that the default Docker image uses path /var/lib/acme-dns/acme-dns.db for sqlite
connection = "/var/lib/acme-dns/acme-dns.db"
# connection = "postgres://user:password@localhost/acmedns_db"

[api]
# listen ip eg. 127.0.0.1
ip = "0.0.0.0"
# disable registration endpoint
disable_registration = false
# listen port, eg. 443 for default HTTPS
port = "80"
# possible values: "letsencrypt", "letsencryptstaging", "cert", "none"
tls = "none"
# only used if tls = "cert"
tls_cert_privkey = "/etc/letsencrypt/live/uti.email/privkey.pem"
tls_cert_fullchain = "/etc/letsencrypt/live/uti.email/fullchain.pem"
# only used if tls = "letsencrypt"
acme_cache_dir = "api-certs"
# optional e-mail address to which Let's Encrypt will send expiration notices for the API's cert
notification_email = "letsencrypt@harianto.dev"
# CORS AllowOrigins, wildcards can be used
corsorigins = [
    "*"
]
# use HTTP header to get the client ip
use_header = false
# header name to pull the ip address / list of ip addresses from
header_name = "X-Forwarded-For"

[logconfig]
# logging level: "error", "warning", "info" or "debug"
loglevel = "debug"
# possible values: stdout, TODO file & integrations
logtype = "stdout"
# file path for logfile TODO
# logfile = "./acme-dns.log"
# format, either "json" or "text"
logformat = "text"
```

`tls = "none"` is deliberate. The reverse proxy speaks HTTPS to the world; the container speaks plain HTTP on 8080.

If your Cloudflare glue uses a separate NS hostname (`ns.uti.email`), keep the A/AAAA for that name at Cloudflare and make sure `records` / `nsname` in this file tell the same story. The working NAS copy above self-NSes as `auth.uti.email`; Cloudflare may still publish `auth → ns.uti.email` plus an A for `ns`. Both sides need to agree on “who answers for the zone” and “which IP is grey-cloud”.

---

## 2. Cloudflare DNS for `uti.email`

Grey cloud on the nameserver names. Orange cloud is fine for the website CNAME into the tunnel.

### Short list (all of it, readable)

**Parent zone `uti.email` (Cloudflare owns this)**

| Name | Type | Content | Proxy | Why |
| --- | --- | --- | --- | --- |
| `uti.email` | SOA | `gabriel.ns.cloudflare.com.` / `dns.cloudflare.com.` | — | Cloudflare’s zone authority (leave alone) |
| `uti.email` | NS | `gabriel.ns.cloudflare.com.` | — | Parent nameservers |
| `uti.email` | NS | `nicole.ns.cloudflare.com.` | — | Parent nameservers |
| `uti.email` | CNAME | `7864111e-97ff-44f3-9f81-f1faa48d297a.cfargotunnel.com.` | Proxied | Website via tunnel |

**Auth zone glue + delegation (you add these — DNS only)**

| Name | Type | Content | Proxy | Why |
| --- | --- | --- | --- | --- |
| `auth.uti.email` | A | `84.86.220.240` | DNS only | Public IP of the Synology / acme-dns |
| `ns.uti.email` | A | `84.86.220.240` | DNS only | Glue for the NS hostname |
| `ns.uti.email` | AAAA | `2a02:a469:f268:0:45a1:ee65:40cd:ee13` | DNS only | IPv6 glue (same host) |
| `auth.uti.email` | NS | `ns.uti.email` | — | Hand the `auth` zone to acme-dns |

**ACME challenge for this cert**

| Name | Type | Content | Proxy | Why |
| --- | --- | --- | --- | --- |
| `_acme-challenge.uti.email` | CNAME | `f416f599-61b5-4a16-94c9-47f9a1f35312.harianto.myds.me.` | DNS only | Points at the `fulldomain` from `clientstorage.json` |

Do not orange-cloud `auth`, `ns`, or `_acme-challenge`. Let's Encrypt must hit your IP on port 53, not Cloudflare’s proxy.

### Full zone export

Snapshot from Cloudflare (2026-08-21). Informational — edit before re-importing anywhere. Parent SOA/NS stay Cloudflare’s; the auth glue and challenge are yours:

```txt
;;
;; Domain:     uti.email.
;; Exported:   2026-08-21 05:28:27
;;
;; This file is intended for use for informational and archival
;; purposes ONLY and MUST be edited before use on a production
;; DNS server.  In particular, you must:
;;   -- update the SOA record with the correct authoritative name server
;;   -- update the SOA record with the contact e-mail address information
;;   -- update the NS record(s) with the authoritative name servers for this domain.
;;
;; For further information, please consult the BIND documentation
;; located on the following website:
;;
;; http://www.isc.org/
;;
;; And RFC 1035:
;;
;; http://www.ietf.org/rfc/rfc1035.txt
;;
;; Please note that we do NOT offer technical support for any use
;; of this zone data, the BIND name server, or any other third-party
;; DNS software.
;;
;; Use at your own risk.
;; SOA Record
uti.email	3600	IN	SOA	gabriel.ns.cloudflare.com. dns.cloudflare.com. 2053895670 10000 2400 604800 3600

;; NS Records (parent zone — Cloudflare)
uti.email.	86400	IN	NS	gabriel.ns.cloudflare.com.
uti.email.	86400	IN	NS	nicole.ns.cloudflare.com.

;; A Records (auth zone glue — DNS only / grey cloud)
auth.uti.email.	1	IN	A	84.86.220.240 ; cf_tags=cf-proxied:false
ns.uti.email.	1	IN	A	84.86.220.240 ; cf_tags=cf-proxied:false

;; AAAA Records
ns.uti.email.	1	IN	AAAA	2a02:a469:f268:0:45a1:ee65:40cd:ee13 ; cf_tags=cf-proxied:false

;; CNAME Records
_acme-challenge.uti.email.	1	IN	CNAME	f416f599-61b5-4a16-94c9-47f9a1f35312.harianto.myds.me. ; ACME CHALLENGE cf_tags=cf-proxied:false
uti.email.	1	IN	CNAME	7864111e-97ff-44f3-9f81-f1faa48d297a.cfargotunnel.com. ; cf_tags=cf-proxied:true

;; NS Records (delegate auth.uti.email to your NS hostname)
auth.uti.email.	1	IN	NS	ns.uti.email.
```

Sanity check from **outside** the house (cellular, not LAN DNS):

```bash
dig A auth.uti.email
dig NS auth.uti.email
dig @84.86.220.240 SOA auth.uti.email
dig TXT _acme-challenge.uti.email
```

You want the A on the public IP (not Cloudflare proxy addresses), an NS that points at your glue, an SOA that looks like acme-dns, and the challenge CNAME following into the fulldomain.

---

## 3. Synology Reverse Proxy

Publish the API on the host, then let DSM terminate TLS:

| Description | Source | Destination |
| --- | --- | --- |
| `acmedns-server http` | `http://auth.uti.email:80` | `http://localhost:8080` |
| `acmedns-server https` | `https://auth.uti.email:443` | `http://localhost:8080` |

Compose maps container `:80` → host `8080` (see below). Nothing fancy — hostname in, localhost out.

---

## 4. Register the domain in acmedns-client

| Field | Value that worked |
| --- | --- |
| Domain | `uti.email` (the line apex — what you put first in `domains.txt`) |
| Server URL | `http://auth.uti.email` |

**HTTP, not HTTPS.** On this NAS the hook and the Nuxt server talk to the reverse proxy over HTTP (or straight to Docker DNS). Pointing `server_url` at `https://auth.uti.email` from inside containers was a reliable way to get `socket.gaierror: [Errno -3] Try again` / connection failures. Store the public identity you can actually reach from the stack: plain `http://auth.uti.email`.

After register, copy the `fulldomain` into the `_acme-challenge.<apex>` CNAME at the real DNS.

---

## 5. Docker Compose ports on the NAS

`acmedns-server` needs DNS on the host **and** the API reachable for the reverse proxy:

```yml
services:
  acmedns-server:
    ports:
      - "53:53"
      - "53:53/udp"
      - "8080:80"
      - "8443:443"
```

- `53` — Let's Encrypt. Nothing else on the NAS should bind it (Synology DNS Server package, another DNS container, …).
- `8080:80` — what the reverse proxy targets.
- `8443:443` — optional; unused while `tls = "none"`.

`acmedns-letsencrypt` publishes nothing. It talks out to Let's Encrypt and to the API. Prefer the compose service name when you can (`http://acmedns-server`); if `clientstorage` already has `http://auth.uti.email`, the reverse proxy path above is what made that work on Synology.

---

## 6. `domains.txt`

File: `data/acmedns-letsencrypt/domains.txt`

One certificate per line. Restart `acmedns-letsencrypt` after edits — the renew loop alone will not pick up new SANs.

```txt
# Domain list for Let's Encrypt
#
# Format:
#   name [name ...]
#
# - One certificate per line
# - Names are separated by spaces or commas; order on the line does not matter
# - Group related names on one line: one ACME order, one renew, one PEM
# - Register only the line apex (e.g. mdstn.com) in acmedns-client; nested
#   wildcards reuse that account via parent-walk in the Certbot hook
# - Nested wildcards imply parent wildcards on the cert automatically, e.g.
#     *.label.parent.example.com  also adds  *.parent.example.com
#     *.fail.label.parent.example.com  also adds  *.parent and *.label.parent
# - Write *.example.com on the line if you want that apex wildcard on the cert
# - Each wildcard must be its own name (*.example.com). *.*.example.com is invalid
# - After editing this file, restart acmedns-letsencrypt (renew loop alone is not enough)
# - Lines starting with # or ; are comments
# - Empty lines are ignored
#
# CNAME (proven for mdstn.com): _acme-challenge.<apex> → fulldomain; nested
#   zones CNAME to _acme-challenge.<apex> (do not repeat the UUID on every row).
# auth.acme-dns.io: still usable; two TXT slots per account (apex + one wildcard).
#
# This file is written on first start if it is missing.

# Proven on Synology (apex + one wildcard):
uti.email *.uti.email

# Proven on Synology (grouped SANs — nested CNAMEs chain to the apex challenge):
mdstn.com *.mdstn.com *.oib.mdstn.com *.otherinbox.mdstn.com *.admin.mdstn.com
# mdstn.com *.mdstn.com *.fail.label.parent.mdstn.com
# harianto.dev *.harianto.dev
```

### Nested SAN CNAMEs (`mdstn.com`) — proven

Register **only** `mdstn.com`. Do not register `oib.mdstn.com` / `admin.mdstn.com` as extra acme-dns accounts. One UUID, one apex CNAME; nested zones chain to that name. DNS only (grey cloud). Repeating the UUID on every nested row also works; the chain is shorter when the UUID changes.

```mermaid
flowchart LR
  oib["_acme-challenge.oib.mdstn.com"] --> apex["_acme-challenge.mdstn.com"]
  admin["_acme-challenge.admin.mdstn.com"] --> apex
  other["_acme-challenge.otherinbox.mdstn.com"] --> apex
  apex --> uuid["87eb4f67-....auth.uti.email"]
```

Working Cloudflare records (2026-08-21):

```txt
;; CNAME Records
_acme-challenge.admin.mdstn.com.	1	IN	CNAME	_acme-challenge.mdstn.com. ; cf_tags=cf-proxied:false
_acme-challenge.mdstn.com.	1	IN	CNAME	87eb4f67-8cbb-4477-805d-4c2c6ca0caa3.auth.uti.email. ; cf_tags=cf-proxied:false
_acme-challenge.oib.mdstn.com.	1	IN	CNAME	_acme-challenge.mdstn.com. ; cf_tags=cf-proxied:false
_acme-challenge.otherinbox.mdstn.com.	1	IN	CNAME	_acme-challenge.mdstn.com. ; cf_tags=cf-proxied:false
```

The apex target is the `fulldomain` from the `mdstn.com` row in `clientstorage.json`. Nested names do not get their own UUID. Do not orange-cloud any `_acme-challenge` row.

From cellular:

```bash
dig TXT _acme-challenge.mdstn.com
dig TXT _acme-challenge.oib.mdstn.com
```

Both should follow into `87eb4f67-….auth.uti.email` (then TXT from acme-dns). NXDOMAIN on a nested name means that chain CNAME is missing.

### Multi-wildcard status

This tree’s `acmedns-server` keeps **100** TXT records per account. The `mdstn.com` grouped line above issued on the NAS with those CNAMEs. Do not re-register `mdstn.com` to “fix” slots — that would mint a new UUID and you would have to edit `_acme-challenge.mdstn.com` only (the nested chains stay).

### Public `auth.acme-dns.io`

Still valid as a Register **Server URL**. It is upstream acme-dns: **two TXT slots per account**. Proven pattern: `mdstn.com *.mdstn.com` on one UUID. A third name on that same fulldomain (`*.oib.mdstn.com` chained to the apex) will overwrite a token.

For more names on the public service: register a **separate** account per nested zone and CNAME `_acme-challenge.oib.mdstn.com` at **that** fulldomain — do not chain to the apex UUID.

This NAS Certbot uses `ACMEDNS_URL` for your server (`https://auth.uti.email`). The hook then **skips** `auth.acme-dns.io` rows and uses the local apex account. Keep public-service logins for tools that actually talk to acme-dns.io; grouped SANs on this stack stay on `auth.uti.email`.

---

## Quick checklist

1. Compose runs on the Synology (DMZ host).
2. `53/tcp` and `53/udp` published; nothing else owns 53.
3. Cloudflare: grey-cloud A/NS glue for `auth` / `ns`; apex `_acme-challenge` CNAME → `fulldomain`; nested zones chain to that apex name.
4. Reverse proxy: `auth.uti.email` → `localhost:8080`.
5. Register apex with **`http://auth.uti.email`**.
6. `domains.txt` lists the cert; restart `acmedns-letsencrypt`.
7. From cellular: dig A/NS/SOA/TXT until they look right, then watch Certbot logs for `Successfully updated TXT record` and a green issue.

When adding another nested wildcard: one new CNAME `_acme-challenge.<zone>.mdstn.com` → `_acme-challenge.mdstn.com`, append the name on the same `domains.txt` line, restart `acmedns-letsencrypt`.
