# Hostnames do not split ports

A hostname is a label. Packets still go to an **IP and port**. The router’s DMZ and port forwards never see `auth.uti.email` vs `auth.uti.email`.

## Record types

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

## Why the nameserver cannot be only a CNAME

If `auth.uti.email` were only a CNAME to another name, resolvers would have to look *that* name up in order to find the nameserver they need for the lookup. For a self-hosted NS that loop fails. The parent zone therefore publishes **glue**: `auth.uti.email → 84.86.220.240`.

If the public IP changes, you update that **one** A (and the glue at Cloudflare). You do not rewrite every `_acme-challenge` CNAME.

## Where hostnames *are* used

- Challenge: `_acme-challenge.mdstn.com` CNAME → `….auth.uti.email`; nested names (`oib`, `admin`, `otherinbox`) CNAME to `_acme-challenge.mdstn.com`
- HTTP API / UI: `https://auth.uti.email` via cloudflared is fine. That is HTTP, not DNS.

## Same as email ports

NAT only sees IP + port (and TCP vs UDP).

| Public port | Typical use | Does the router split on hostname? |
| --- | --- | --- |
| 25 / 587 / 465 | SMTP | No |
| 143 / 993 | IMAP | No |
| 53 | DNS | No |
| 80 / 443 | HTTP(S) | No — but **after** TCP, a reverse proxy can split on `Host` / TLS SNI |

Several names on one IP is normal (many domains, one mail server, one acme-dns). Several names to **different machines** on the **same** public port is not, unless something that already received that port understands the protocol and proxies it. HTTP reverse proxies do that every day. DNS almost never does.

Treat `:53` like `:25`: point it at the one host that should run that service.
