# Reddit posts for DNS01 Stack

**Product name:** **DNS01 Stack** (what you tell Reddit). Active development lives in [acmedns-stack](https://github.com/HariantoAtWork/acmedns-stack); a slimmer public snapshot may appear in [dns01-stack](https://github.com/HariantoAtWork/dns01-stack).

**Strategy:** Post when you have a few spare hours to reply in comments — these are teasers, not runbooks. Many subs prefer links in a comment rather than the post body; check each sub’s rules before posting. Lead with the problem you solved, hold setup detail for follow-ups, and keep example domains generic (`example.org`). If interest is high, answer “how does it work?” with the comment templates below rather than editing the post.

---

## r/selfhosted

### Title

DNS-01 Let's Encrypt without handing your DNS provider an API key — one Docker container, open source

### Body

I've been running homelab TLS with DNS-01 for a while, but I never liked the trade-off: either give Certbot (or a reverse proxy) write access to my real DNS, or run a fiddly multi-container stack and hope nothing drifts apart on upgrade day.

So I built **DNS01 Stack** — a single container that runs acme-dns on public `:53` plus a small operator UI for registration, certificate issue, and renewals. You only add a CNAME at your real provider (`_acme-challenge.example.org` → the delegated subdomain acme-dns gives you). Let's Encrypt talks to *your* auth zone; your registrar never sees an API token from the ACME tooling.

It started as three services (Go acme-dns, a Nuxt client, Certbot). That worked, but restarts, volume mounts, and cross-container HTTP for every TXT update felt brittle. I collapsed it to one image: DNS, API, UI, and ACME in one process.

It's open source and has been running on my Synology for real certs — wildcards included. I'm not posting a full guide here; happy to explain the CNAME setup, port 53 constraints, and why I didn't just use Traefik/Caddy in the comments if anyone's curious.

---

## r/homelab

### Title

Collapsed my ACME DNS-01 stack from 3 containers to 1 — running on a NAS with public port 53

### Body

My homelab needed wildcard certs without exposing DNS provider API keys. The usual answer is acme-dns: delegate `_acme-challenge` with a CNAME, run your own tiny authoritative zone, and let Let's Encrypt query that for DNS-01.

What I didn't want was a Compose file that looked like a mini production deployment — separate Go DNS server, Nuxt operator app, Certbot sidecar, shared volumes, and HTTP hops between containers every time a TXT record needed updating.

**DNS01 Stack** is what I ended up with: one container. Port 53 (TCP/UDP) faces the internet from a DMZ-style host — in my case a Synology with Docker. The UI and register/update API sit on a different port; I only reverse-proxy that for LAN access, not the DNS side.

The interesting bit for me was the refactor story: three services → two → one, without giving up wire-compatible acme-dns behaviour or Certbot-style PEM paths on a shared volume. Other stacks on the NAS still mount `/etc/letsencrypt` read-only.

If you're weighing "run DNS on the NAS" vs "dedicated VM at the edge", I can share what worked for port forwarding and keeping the auth zone off the main LAN in comments.

---

## r/synology

### Title

DNS-01 / acme-dns on DSM Docker — public :53 on the NAS, UI behind reverse proxy only

### Body

Anyone else issuing Let's Encrypt certs from a Synology via DNS-01? I wanted wildcards and SANs without plugging Cloudflare/Route53 API keys into Certbot or my reverse proxy.

I run **DNS01 Stack** in Container Manager: one image, built from the repo. It binds host port **53** for the acme-dns auth zone (that's what Let's Encrypt hits) and **8080** for the operator UI and `/register` / `/update` API. I do *not* expose the UI to the internet — only DSM reverse proxy or LAN, same as you'd treat any admin panel.

At your real DNS provider you add CNAMEs only (`_acme-challenge.example.org` → the subdomain the stack registers). No write API on the provider side.

It replaced a three-container setup (Go acme-dns + Nuxt client + Certbot) that was awkward to upgrade on DSM. Now one service, one set of volumes under `data/`, PEMs in a Certbot-compatible layout for nginx or other containers to mount read-only.

Tested with production certs on a box that already had port 53 forwarded to the NAS. Happy to answer DSM-specific questions — permissions, `cap_add`, volume paths, or why I didn't run DNS on a separate Pi — in the thread.

---

## r/letsencrypt

### Title

DNS-01 with acme-dns: working around the two-TXT limit for multi-SAN wildcard certs (single-container stack)

### Body

Quick share for anyone hitting DNS-01 with **acme-dns** and multiple names on one certificate.

Standard acme-dns keeps **two** rolling TXT slots per account. Fine for a single `_acme-challenge` name; painful when you want one cert covering several wildcards/SANs under the same delegated zone — issuance can fail mid-validation when slots roll before LE finishes.

I'm running a self-hosted stack (**DNS01 Stack**) that ports acme-dns into Nuxt/Node with **100 rolling TXT slots** per account, still wire-compatible on `/register` and `/update`. CNAME delegation at the real zone unchanged; only the auth server behaviour differs. Everything else — SQLite accounts, DNS on `:53`, Certbot-style live/staging paths — matches what you'd expect from acme-dns + a client.

Architecturally it's one container now (DNS + API + ACME client merged), but the bit relevant to this sub is the DNS-01 validation path: LE → your public auth NS → TXT lookup, no provider API.

Not dropping a full config dump — if you want detail on slot accounting, nested wildcard expansion in `domains.txt`, or how this compares to cert-manager's DNS webhooks, ask below.

---

## Comment templates (when people ask)

### "How does it work?"

You keep control of `example.org` at your registrar but **don't** give the ACME tooling API access there.

1. Run DNS01 Stack somewhere with **public port 53** (homelab edge, NAS, small VPS).
2. Register a zone in the UI — you get a `fulldomain` like `abc123.auth.example.org`.
3. At your real DNS, add a CNAME: `_acme-challenge.example.org` → that `fulldomain` (nested zones CNAME to the parent apex's `_acme-challenge`).
4. Add cert names to `domains.txt` (or the Certs UI) and hit Apply. The stack writes TXT records in its auth zone; Let's Encrypt queries `:53` on your stack, not your provider.

Your provider only ever sees static CNAME records you added by hand.

### "Why not Traefik/Caddy/cert-manager?"

Those are great when your DNS provider has a supported API or you're already all-in on that ingress layer.

I wanted **DNS-01 without any write API** at the real provider — just CNAME delegation — and PEM output I could mount into nginx, Synology apps, or anything else without coupling renewal to a specific reverse proxy. acme-dns is the usual pattern for that; this stack bundles the auth server + operator UI + issue/renew so I'm not maintaining three containers.

If you're on Kubernetes with Cloudflare or Route53, cert-manager is probably the better fit. This is aimed at homelab / single-host Docker where port 53 on one box is acceptable.

### "Repo link?"

**DNS01 Stack** (open source):

- Development: https://github.com/HariantoAtWork/acmedns-stack
- Public snapshot: https://github.com/HariantoAtWork/dns01-stack

One container, Docker Compose example in the README. Still early days — issues and PRs welcome if you try it on your setup.

*(Optional follow-up if they ask about many wildcards on one cert: upstream acme-dns only keeps 2 TXT slots per account; this build uses 100 rolling slots, which matters when you pack lots of SANs/wildcards onto one cert.)*
