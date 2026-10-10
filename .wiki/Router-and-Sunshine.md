# Router and Sunshine / Moonlight

L4 TCP/UDP port forwarding in the **Router** UI (`acmedns-router`). This is not the HTTP **Proxy** on `:80/:443`.

## Mental model

- **Target** — named machine (`sunshine` → `192.168.x.x` or Docker DNS name).
- **Source** — public hostname(s) that *own* a port map (DNS label + documentation).
- **Port map** — `(tcp|udp, listenPort) → targetPort` on that target.

On one public IP, each `(protocol, listenPort)` has at most one owner. Hostname alone does not multiplex plain TCP/UDP.

## Sunshine / Moonlight preset

Passthrough ports (keep listen = target):

| Proto | Ports |
| --- | --- |
| TCP | 47984, 47989, 47990 (Web UI), 48010 |
| UDP | 47998, 47999, 48000, 48002, 48010 |

Disable **Sunshine UPnP** when using this router so it does not fight your ISP router.

Remapping stream ports without changing Moonlight/Sunshine on both ends will break video. Remap is mainly for odd cases (e.g. Web UI on another public port).

## Compose / Docker

Binds inside the container only work if the host publishes them.

**Option A — publish ports** in your own `docker-compose.override.yml` (do not wipe unrelated keys):

```yml
services:
  dns01-proxy:
    ports:
      - "47984:47984/tcp"
      - "47989:47989/tcp"
      - "47990:47990/tcp"
      - "48010:48010/tcp"
      - "47998:47998/udp"
      - "47999:47999/udp"
      - "48000:48000/udp"
      - "48002:48002/udp"
      - "48010:48010/udp"
```

**Option B — `network_mode: host`** for dynamic maps (escape hatch; changes how other published ports work).

Cloudflared cannot carry this path (HTTPS tunnel only). Clients must hit the real public IP (or another L4 path).

## Critical ops notes

1. **CGNAT** — if the ISP has no public inbound IPv4, forwarding cannot help.
2. **One Moonlight set per WAN IP** — a second gaming PC needs different public ports (and matching config) or another IP.
3. **No ACL in v1** — these ports expose the target on the internet.
4. **NAT hairpin** — testing from LAN via the WAN hostname often fails; test from outside or use the LAN IP locally.
5. **TLS** — Router is byte-transparent. HTTPS to a forwarded `:443` terminates on the **target** (e.g. nginx), not on dns01-proxy. Prefer **Proxy** when you want edge certs from this stack.

## Data files

Under `$ACMEDNS_DATA_ROOT/client/`:

- `router-targets.json`
- `router-sources.json`
