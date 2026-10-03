# Bun proxy and SSL

The stack’s built-in reverse proxy is a **shared Bun edge** on `:80` / `:443`, not one nginx `server` block per host like Nginx Proxy Manager. Control plane (operator UI, `/register`, `/update`, `/health`, `/api`) stays on `:1080` / `:1443`.

Point **public app hostnames** at edge `80`/`443`. Point **auth UI / Certbot / DSM reverse proxy** at control `1080` (or `1443`).

## SSL Certificate (per Proxy Host)

| Toggle | Meaning |
| --- | --- |
| **On** | This host opts into SSL **features** (Force SSL, HSTS, HTTP/2) and binds covering `live/` certs for its domains. |
| **Off** | Those features stay off for this host. **Not** the same as NPM’s “SSL = None → HTTP only”. |

`:80` always works for an enabled host. HTTPS on `:443` can still answer when another SSL-on host has already registered covering **zone / parent** SNI on the shared listener.

The SSL tab status line is definite: it names the leaf already on `:443`, or says none is bound yet. Certificate names render in green.

## Flags

| Flag | When |
| --- | --- |
| **SSL** | SSL Certificate is on for this host. |
| **Inherited SSL** | SSL Certificate is off, but HTTPS is active via another host’s zone/parent SNI. Tooltip names the leaf (e.g. `harianto.link`). |

Source links use `https://` when coverage is inherited.

## Nested names (e.g. `test.admin.harianto.dev`)

Bun SNI wildcards are **one label**:

| SNI / SAN | Matches |
| --- | --- |
| `*.harianto.dev` | `mail.harianto.dev` |
| `*.harianto.dev` | **not** `test.admin.harianto.dev` |
| `*.admin.harianto.dev` | `test.admin.harianto.dev`, `blog.admin.harianto.dev` |

Edge TLS prefers the covering **parent wildcard** from the live cert (`*.admin.…`). Further nested hosts under that parent share the same SNI set, so adding them hot-swaps routes without rebinding `:443`.

You still need a live cert whose SANs cover the nested name (e.g. `*.admin.harianto.dev` on disk under `live/`).

## Unlike Nginx Proxy Manager

NPM generates `listen 443 ssl` only when a certificate is selected for that host. This stack keeps one shared `:443` and multiplexes with SNI. That is why **Inherited SSL** exists and why Off is not HTTP-only.

## Related

- Certificates / DNS-01: [Certificate checklist](Certificate-checklist.md)
- House ports and DSM reverse proxy: [Working Synology setup](Working-Synology-setup.md)
