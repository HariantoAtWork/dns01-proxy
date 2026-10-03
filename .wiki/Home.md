# Wiki

How public DNS, port 53, and the Bun edge proxy fit this stack. The [README](../README.md) is the operator guide; these pages are the networking and SSL story behind DNS-01 and Proxy Hosts.

## Pages

- [Bun proxy and SSL](Proxy-SSL.md) — shared `:80`/`:443`, SSL Certificate vs Inherited SSL, nested admin SNI
- [Tiny stack (shared mode)](Tiny-stack.md) — slim auth zone without Register UI
- [Working Synology setup](Working-Synology-setup.md) — runbook that issued certs on the NAS
- [Test this stack on the Synology](Test-on-Synology.md) — DMZ owns public 53; Mac Compose cannot prove DNS-01
- [Public DNS and port 53](Public-DNS-and-port-53.md) — glue, why Let's Encrypt must reach this box on 53
- [VPS port 53](VPS-port-53.md) — bind `:53` to the public/NIC IPv4 when `0.0.0.0:53` collides with resolved
- [Cloudflared and DNS](Cloudflared-and-DNS.md) — tunnel is HTTPS only; it cannot carry DNS-01
- [Certificate checklist](Certificate-checklist.md) — CNAME, glue, forward, then Apply in the Certs UI

## Two paths (DNS-01)

The UI talks to acme-dns **in-process** inside `acmedns-stack` (or over HTTP for an external server). Let's Encrypt does **not**. Validators only do a public DNS lookup. Those two paths are easy to mix up.

```mermaid
flowchart LR
  UI[acmedns-stack UI] -->|in-process /update| API[acmedns-stack]
  LE[Lets Encrypt] -->|DNS-01 UDP/TCP 53| DNS[acmedns-stack :53]
  Tunnel[cloudflared] -->|HTTPS hostname| UI
```

HTTP UI traffic can go through cloudflared. Port 53 cannot.

## Two HTTPS paths (apps)

```mermaid
flowchart LR
  App[Public app hostname] -->|SNI on shared edge| Edge[Bun :443]
  Auth[auth zone / UI] -->|control| Ctrl[Bun :1080 / :1443]
  Tunnel2[cloudflared] -->|mapped hostname| Ctrl
```

Public Proxy Hosts use the shared edge ([Bun proxy and SSL](Proxy-SSL.md)). Auth / operator traffic uses the control ports (or the tunnel).
