# Public DNS and port 53

acme-dns is a small **authoritative** DNS server for one zone (here `auth.uti.email`). Let's Encrypt follows a CNAME from your real domain into that zone, then queries **this** server for the TXT token.

A hostname is only a label. Packets still go to an **IP and port**. The router’s DMZ and port forwards never see `auth.uti.email` vs some other name on the same A record.

## What must be on the public internet

1. At the real DNS for the certificate name (Cloudflare, registrar, …):  
   `CNAME _acme-challenge.mdstn.com` → the `fulldomain` in `clientstorage.json`  
   (for example `87eb4f67-….auth.uti.email`).  
   Nested names chain to that apex challenge (`_acme-challenge.oib.mdstn.com` → `_acme-challenge.mdstn.com`). Proven records: [Working Synology setup](Working-Synology-setup.md).
2. Parent zone for `uti.email`: NS/A **glue** so resolvers know where `auth.uti.email` lives.
3. That A record (and `config.cfg` `records`) point at the public IP that answers **UDP/53 and TCP/53** with acme-dns.

NS records have **no port field**. Public DNS is always port 53. You cannot publish “DNS on 5353”. You can NAT `public:53` → `lan:53`; the internet still sees IP + 53.

You need **both** UDP and TCP 53. Compose maps both.

## Record types and glue

| Record | Meaning |
| --- | --- |
| `A` / `AAAA` | Name → IPv4 / IPv6 |
| `CNAME` | Name → another name (then look that up) |
| `NS` | This zone’s DNS server is this **name** |

`config.cfg` already uses a hostname for NS:

```
auth.uti.email. A 84.86.220.240
auth.uti.email. NS auth.uti.email.
```

`NS auth.uti.email` says “ask the machine named `auth.uti.email`”. That name still needs an A (or AAAA), or nobody knows where to send UDP/53.

If `auth.uti.email` were only a CNAME to another name, resolvers would have to look *that* name up in order to find the nameserver they need for the lookup. For a self-hosted NS that loop fails. The parent zone therefore publishes **glue**: `auth.uti.email → 84.86.220.240`.

If the public IP changes, you update that **one** A (and the glue at Cloudflare). You do not rewrite every `_acme-challenge` CNAME.

## What does not need to be public

| Piece | Public? |
| --- | --- |
| acme-dns DNS (`:53`) | Yes |
| Control HTTP API (`:1080` register/update) | No — Compose name, DSM reverse proxy, or cloudflared |
| Operator UI (`:1080` / `:1443`) | No |
| Edge apps (`:80` / `:443`) | Only if you terminate public websites on this host — see [Bun proxy and SSL](Proxy-SSL.md) |
| ACME issuer (Certs UI, in-process) | No — outbound only |

One acme-dns on one `:53` serves every registered hostname. You do not open a port per domain.

## Same as email ports

NAT only sees IP + port (and TCP vs UDP).

| Public port | Typical use | Does the router split on hostname? |
| --- | --- | --- |
| 25 / 587 / 465 | SMTP | No |
| 143 / 993 | IMAP | No |
| 53 | DNS | No |
| 80 / 443 | HTTP(S) | No — but **after** TCP, a reverse proxy can split on `Host` / TLS SNI |

Several names on one IP is normal. Several names to **different machines** on the **same** public port is not, unless something that already received that port understands the protocol and proxies it. HTTP reverse proxies do that every day. DNS almost never does.

Treat `:53` like `:25`: point it at the one host that should run that service. In this house that is usually the Synology — [Test this stack on the Synology](Test-on-Synology.md).

## Grey cloud

The A record for the nameserver must be **DNS-only** (grey cloud). Orange-cloud is an HTTP proxy. It will not answer DNS on 53.

## One IP, one owner of 53

On one public IPv4, only one process can own 53. Unbound, Pi-hole, Synology DNS Server, or systemd-resolved on that same public 53 will steal the queries. Let's Encrypt then never talks to `dns01-proxy`.
