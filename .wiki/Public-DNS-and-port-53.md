# Public DNS and port 53

acme-dns is a small **authoritative** DNS server for one zone (here `auth.uti.email`). Let's Encrypt follows a CNAME from your real domain into that zone, then queries **this** server for the TXT token.

## What must be on the public internet

1. At the real DNS for the certificate name (Cloudflare, registrar, …):  
   `CNAME _acme-challenge.mdstn.com` → the `fulldomain` in `clientstorage.json`  
   (for example `87eb4f67-….auth.uti.email`).  
   Nested names chain to that apex challenge (`_acme-challenge.oib.mdstn.com` → `_acme-challenge.mdstn.com`). Proven records: [Working Synology setup](Working-Synology-setup.md).
2. Parent zone for `uti.email`: NS/A **glue** so resolvers know where `auth.uti.email` lives.
3. That A record (and `config.cfg` `records`) point at the public IP that answers **UDP/53 and TCP/53** with acme-dns.

NS records have **no port field**. Public DNS is always port 53. You cannot publish “DNS on 5353”. You can NAT `public:53` → `lan:53`; the internet still sees IP + 53.

You need **both** UDP and TCP 53. Compose maps both.

## What does not need to be public

| Piece | Public? |
| --- | --- |
| acme-dns DNS (`:53`) | Yes |
| acme-dns HTTP API (`:80` register/update) | No — Compose name or cloudflared |
| Nuxt UI (`:82`) | No |
| Certbot | No — outbound only |

One acme-dns on one `:53` serves every registered hostname. You do not open a port per domain.

## Grey cloud

The A record for the nameserver must be **DNS-only** (grey cloud). Orange-cloud is an HTTP proxy. It will not answer DNS on 53.

## One IP, one owner of 53

On one public IPv4, only one process can own 53. Unbound, Pi-hole, Synology DNS Server, or systemd-resolved on that same public 53 will steal the queries. Let's Encrypt then never talks to `acmedns-nuxt` on the Mac.
