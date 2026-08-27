# Cloudflared and DNS

Cloudflared looks like it splits traffic by hostname. It does, but only for **HTTP(S)**, and not through your public IP.

## What the tunnel does

1. `cloudflared` on the LAN opens an **outbound** connection to Cloudflare (usually 443).
2. Inbound NAT / DMZ is irrelevant for that path.
3. A client hits `https://auth.uti.email` (or whichever hostname you mapped).
4. Cloudflare’s edge already has the hostname (TLS SNI / HTTP `Host`).
5. Cloudflare sends the request down that tunnel to the container in `docker-compose.override.yml` (from the `.example`; `acmedns-stack:80`, …).

Hostname routing lives at **Cloudflare**, not on `84.86.220.240:443`. Many names, one tunnel.

## What it cannot do

Let's Encrypt DNS-01 is **UDP/TCP 53**. Validators follow NS/A glue and talk to your public IP on port 53. They will not send that query down a Cloudflare Tunnel.

A grey-cloud A `auth.uti.email → 84.86.220.240` is the opposite of a tunnel: “send DNS to this IP”. Orange-cloud on that name would proxy HTTP and break it as a nameserver.

## In this compose

The external `cloudflared` network is attached to `acmedns-stack` so the **UI and HTTP API** can have hostnames. Port 53 stays on the host.

In-process `/update` works even when public 53 is wrong for Let's Encrypt. The API path can succeed while the **outside** TXT check fails.
