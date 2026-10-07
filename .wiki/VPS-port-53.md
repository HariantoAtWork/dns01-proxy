# VPS: bind port 53 to the public IP

On a single-IP VPS, the NIC address **is** the public IP. Publishing `53:53` (`0.0.0.0:53`) often fails because **systemd-resolved** already holds `127.0.0.1:53`. Binding only the public address avoids that collision — no `network_mode: host`.

At home the usual path is different: router **DMZ** (or forward UDP/TCP 53) to the Synology and publish `53:53` there. See [Test this stack on the Synology](Test-on-Synology.md).

## Compose

[`vps.yml`](../vps.yml) publishes `${PUBLIC_IP}:53` (UDP+TCP). Detect and start:

```bash
./dc.sh vps
# ./dc.sh vps-down
# ./dc.sh vps-restart
```

Or pin the address:

```bash
PUBLIC_IP=203.0.113.10 ./dc.sh vps
```

(`203.0.113.10` is documentation-only — use your real VPS IPv4.)

| Field | Meaning |
| --- | --- |
| `PUBLIC_IP` | IPv4 on this host that answers DNS (default: `src` from `ip route get 1.1.1.1`) |
| `ports: !override` | Replaces base `53:53` with `PUBLIC_IP:53` only; edge/control stay on all interfaces |

## DNS glue

Point auth-zone A (and NS glue) at **that same** IPv4. Grey-cloud only. See [Public DNS and port 53](Public-DNS-and-port-53.md).

## Checks

```bash
# from another machine / cellular — not only from the VPS itself
dig @$PUBLIC_IP SOA auth.example.com +udp
dig @$PUBLIC_IP SOA auth.example.com +tcp
```

## Caveats

- Linux with `ip` (iproute2). Intended for a VPS, not for Mac laptop bind experiments.
- Provider firewall / security group must allow **UDP+TCP 53**.
- cloudflared still does **not** carry port 53 — [Cloudflared and DNS](Cloudflared-and-DNS.md).
