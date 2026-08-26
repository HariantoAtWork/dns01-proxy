# DMZ, Synology, and Mac

Typical home layout here: public IP `84.86.220.240`, router DMZ to the **Synology**, this Compose stack on the **Mac**.

## What DMZ does

Unsolicited inbound traffic that is not already port-forwarded is sent to one LAN host. Then:

```
Internet → 84.86.220.240:53 → router DMZ → Synology:53
                                         ↳ Mac never sees it
```

`acmedns-nuxt` can listen on the Mac’s `:53` all day. Let's Encrypt still queries the Synology.

`auth.uti.email` and `auth.uti.email` can both resolve to the same IP. For **websites**, the Synology reverse proxy can send each name to a different app (HTTP `Host` / SNI). For **DNS**, both names are still `84.86.220.240:53`, so both go to the Synology.

## What actually works

1. **Port-forward 53** (UDP and TCP) to the Mac, and confirm the router applies forwards **before** DMZ. Other ports can still DMZ to the Synology.
2. **Run this stack on the Synology** (publish `53/udp` and `53/tcp` there). Then DMZ-to-Synology is the right target.
3. **Change DMZ to the Mac** — usually a bad idea; it dumps the whole internet at the Mac.

Synology **DNS Server** (or another container bound to 53) will answer instead of acme-dns even after you forward 53, if that process still owns the port.

## Synology certificates vs this stack

Certificates issued **on the Synology** can succeed without this Mac stack:

- HTTP-01 on 80/443 (DMZ / reverse proxy)
- Cloudflare DNS API (no local `:53`)
- a DNS or acme-dns process **on the Synology** that owns public 53

So: Mac DNS-01 fails until 53 reaches the Mac (or you move Compose to the NAS). Synology certs working does **not** prove `auth.uti.email` is serving acme-dns.

Operator rule for this house: [test certificate issuance on the Synology](Test-on-Synology.md).
