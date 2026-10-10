# Proxy bearer lists

Bind a **Bearer List** on a Proxy Host so clients must send `Authorization: Bearer …` matching any key in that list. The gateway token is never forwarded upstream.

## Defaults

| Request | With bearer list, no path filter |
| --- | --- |
| `GET /` without bearer | Public live status (HTML / JSON / SSE) |
| Any other path without bearer | **401** `WWW-Authenticate: Bearer` |

## Path prefixes (optional)

On the host **Details** tab, when a Bearer List is selected, **Bearer paths** accepts one path prefix per line (e.g. `/tunnel`).

| `bearerPaths` | Effect |
| --- | --- |
| Empty | Legacy: bearer required on all paths except `GET /` |
| `/tunnel` | Only `/tunnel` (and `/tunnel/…`) require bearer; `/t/…`, `/health`, etc. stay open |

Prefix match uses a path boundary: `/tunnel` does **not** match `/tunneling`.

## headless-tunnel

Typical public edge:

1. Proxy Host → upstream `headless-tunnel:9382`, WebSockets on.
2. Bearer List bound; **Bearer paths** = `/tunnel`.
3. Apps register with `Authorization: Bearer …` on `wss://…/tunnel`.
4. Playwright/Oxider fetch `https://…/t/:id/…` **without** a bearer.
