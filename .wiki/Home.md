# Wiki

How public DNS, port 53, and this stack fit together. The [README](../README.md) is the operator guide; these pages are the networking story behind DNS-01.

## Pages

- [Test this stack on the Synology](Test-on-Synology.md) — DMZ owns public 53; Mac Compose cannot prove DNS-01
- [Public DNS and port 53](Public-DNS-and-port-53.md) — why Let's Encrypt must reach this box on 53
- [Hostnames do not split ports](Hostnames-do-not-split-ports.md) — A records, glue, email as an analogy
- [DMZ, Synology, and Mac](DMZ-Synology-and-Mac.md) — where `84.86.220.240:53` actually lands
- [Cloudflared and DNS](Cloudflared-and-DNS.md) — why the tunnel feels magical and still cannot carry DNS-01
- [Certificate checklist](Certificate-checklist.md) — CNAME, glue, forward, then Certbot

## Two paths

Certbot talks to acme-dns over **HTTP** (`/update`). Let's Encrypt does **not**. Validators only do a public DNS lookup. Those two paths are easy to mix up.

```mermaid
flowchart LR
  Certbot[acmedns-letsencrypt] -->|HTTP /update| API[acmedns-server :80]
  LE[Lets Encrypt] -->|DNS-01 UDP/TCP 53| DNS[acmedns-server :53]
  Tunnel[cloudflared] -->|HTTPS hostname| API
  Tunnel -->|HTTPS hostname| UI[acmedns-client]
```

HTTP can go through Docker DNS or cloudflared. Port 53 cannot.
