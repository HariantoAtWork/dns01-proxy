# Test this stack on the Synology

This house’s router **DMZ is the Synology**. Public `84.86.220.240:53` therefore lands on the NAS, not on a Mac. Let’s Encrypt DNS-01 talks to **that** port. Running `docker compose` on the Mac is useful for the UI and the HTTP API; it is **not** a valid test of certificate issuance.

```
Internet → 84.86.220.240:53 → router DMZ → Synology:53
                                         ↳ Mac never sees it
```

Full DNS-01 (hook **and** Let’s Encrypt seeing the TXT) only works when Compose runs **on the Synology**, or when UDP+TCP 53 is forwarded to whichever host actually runs `dns01-proxy`. With DMZ as it is, that host is the NAS.

For glue / “NS has no port”: [Public DNS and port 53](Public-DNS-and-port-53.md). For the Bun edge vs DSM reverse proxy: [Bun proxy and SSL](Proxy-SSL.md).

## What DMZ does

Unsolicited inbound traffic that is not already port-forwarded goes to one LAN host. Options that actually work:

1. **Port-forward 53** (UDP and TCP) to the Mac, and confirm the router applies forwards **before** DMZ. Other ports can still DMZ to the Synology.
2. **Run this stack on the Synology** (publish `53/udp` and `53/tcp` there). Then DMZ-to-Synology is the right target.
3. **Change DMZ to the Mac** — usually a bad idea; it dumps the whole internet at the Mac.

Synology **DNS Server** (or another container bound to 53) will answer instead of acme-dns even after you forward 53, if that process still owns the port.

Website hostnames can share one IP (HTTP `Host` / TLS SNI). DNS cannot: every name that resolves to `84.86.220.240` still hits Synology `:53`.

## What the Mac can prove

| Check | On the Mac |
| --- | --- |
| Nuxt UI, register a hostname, `clientstorage.json` | Yes |
| Certbot hook `Successfully updated TXT record` via control HTTP / cloudflared | Yes — that is HTTP |
| Let’s Encrypt `NXDOMAIN` / failed DNS-01 | Expected — public 53 is not this container |

Do not treat a green hook plus a red Certbot log as an app bug. The update path and the validator path are different.

## What you must run on the Synology

Publish **53/tcp and 53/udp** on the NAS (see [Working Synology setup](Working-Synology-setup.md)). Let’s Encrypt will then query the machine the DMZ already points at.

Also required, or issuance still fails on the NAS:

- Grey-cloud **A** for `auth.uti.email` → `84.86.220.240` (not Cloudflare proxy IPs)
- **NS** delegation for `auth.uti.email` so it is a zone, not only a website name
- `_acme-challenge.<apex>` **CNAME** to the `fulldomain` in storage; nested zones CNAME to `_acme-challenge.<apex>`
- Nothing else bound to 53 on the Synology (DNS Server package, another DNS container)

See [Certificate checklist](Certificate-checklist.md).

## Synology certificates vs this stack

Certificates issued **on the Synology** can succeed without this Compose stack (HTTP-01, Cloudflare DNS API, or another process owning public 53). That does **not** prove `auth.uti.email` is serving acme-dns from `dns01-proxy`.

## What not to do

- Do not point DMZ at the Mac just to try this stack.
- Do not expect cloudflared to carry port 53. [Cloudflared and DNS](Cloudflared-and-DNS.md).
- Do not assume Synology Control Panel certificates “working” means this Compose DNS-01 works.

## Copy the project to the NAS

Same git checkout (or copy) of this repo. Same `.env`, `config.cfg`, `domains.txt`, and `clientstorage.json`. Publish 53 on the Synology host, not only inside Docker’s user-defined network. If Container Manager uses a different network driver, still map `53:53/tcp` and `53:53/udp` to the NAS.

After it is up, from **outside** the LAN (cellular):

```bash
dig A auth.uti.email
dig @84.86.220.240 SOA auth.uti.email
```

The A record should be `84.86.220.240` (grey cloud). The SOA query should look like acme-dns, not NXDOMAIN from another daemon.
