# Macvlan for port 53

When the Docker **host** already owns `:53` (Synology DNS Server, systemd-resolved, another resolver), publish mapping `53:53/udp` fails or steals queries. Macvlan gives `acmedns-stack` its **own** MAC and IP on the LAN (or an extra public IP on a VPS). Let's Encrypt then hits that IP on UDP/TCP 53.

## Compose

Copy [`docker-compose.override.yml.example`](../docker-compose.override.yml.example) → `docker-compose.override.yml` and set:

| Field | Meaning |
| --- | --- |
| `driver_opts.parent` | Host NIC facing the network (`eth0`, `ovs_eth0`, …) |
| `ipam.subnet` / `gateway` | Same L2/L3 as that NIC |
| `dns53.ipv4_address` | Free IP for this container — the address in NS/A glue |

`ports: !override` **drops** host `53:53` / `53:53/udp`. The process still listens on `0.0.0.0:53` inside the container; that is reachable as `MACVLAN_IP:53` (UDP and TCP). Edge (`80`/`443`) and control (`1080`/`1443`) stay on the host for reverse proxy / cloudflared / tsdproxy.

## DNS glue

Point the auth-zone A (and NS glue) at **`MACVLAN_IP`**, not the NAS/host IP. Grey-cloud only. See [Public DNS and port 53](Public-DNS-and-port-53.md).

## Checks

```bash
# from another machine on the LAN / internet
dig @MACVLAN_IP SOA auth.example.com +udp
dig @MACVLAN_IP SOA auth.example.com +tcp
```

## Caveats

- The **host** often cannot reach the macvlan IP directly (Docker macvlan isolation). Probe from another host, cellular, or a second NIC/shim.
- You need a **free** IP on that subnet (or a provider extra IP). Reusing the host’s primary IP does not help.
- cloudflared still does **not** carry port 53 — [Cloudflared and DNS](Cloudflared-and-DNS.md).
