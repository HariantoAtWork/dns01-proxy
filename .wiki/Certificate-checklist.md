# Certificate checklist

For a line such as `mdstn.com *.mdstn.com *.oib.mdstn.com *.otherinbox.mdstn.com *.admin.mdstn.com`:

1. Register **`mdstn.com`** in the UI **before** Apply. Nested wildcards on the same line reuse that account (parent-walk). No duplicate JSON rows needed.
2. At the real DNS for `mdstn.com` (proven, DNS only / grey cloud): one apex CNAME to the `fulldomain`; nested zones chain to that apex name — do not repeat the UUID.

```txt
_acme-challenge.mdstn.com.              IN CNAME 87eb4f67-8cbb-4477-805d-4c2c6ca0caa3.auth.uti.email.
_acme-challenge.oib.mdstn.com.          IN CNAME _acme-challenge.mdstn.com.
_acme-challenge.otherinbox.mdstn.com.   IN CNAME _acme-challenge.mdstn.com.
_acme-challenge.admin.mdstn.com.        IN CNAME _acme-challenge.mdstn.com.
```

NXDOMAIN on a challenge name means that CNAME is missing or wrong. Full NAS runbook: [Working Synology setup](Working-Synology-setup.md).
3. At Cloudflare/registrar for `uti.email`: NS/A glue for `auth.uti.email` to the public IP, **grey cloud**. Must match `domain` / `records` in `config.cfg`.
4. Firewall/router: **UDP+TCP 53** to the host that actually runs `acmedns-stack`. With DMZ on the Synology, that means **run Compose on the NAS** (see [Test this stack on the Synology](Test-on-Synology.md)), not on a Mac that never receives public 53.
5. `domains.txt` lists the names on one line (order does not matter). Nested wildcards imply parent wildcards on the cert (e.g. `*.fail.label.parent.mdstn.com` also adds `*.parent.mdstn.com`). Edit in the Certs UI or on disk, **Save**, then **Apply** — no container restart. Production writes `live/`; Staging writes `staging/` only.
6. Grouped SANs on one acme-dns account need **100 TXT slots**. Rebuild `acmedns-stack` from this tree (existing accounts are padded on start). Do not re-register the apex to gain slots.
7. **`https://auth.acme-dns.io` still works**, but each public-service account only holds two TXT tokens (`example.com` + `*.example.com`). Nested names need another account and another CNAME, not a chain to the same UUID. Mixed storage is fine: the issuer uses each row’s own `server_url` (most-specific key first).

Message `No acme-dns account for …` means the **container’s** `clientstorage.json` has no matching key or ancestor. Register the line apex.

From outside the house (cellular, not LAN DNS):

```bash
dig NS auth.uti.email
dig A auth.uti.email
dig TXT _acme-challenge.mdstn.com
```

The last one should follow the CNAME into `….auth.uti.email`. If `dig @84.86.220.240 A <uuid>.auth.uti.email` times out or answers from Synology’s resolver, public 53 is not acme-dns on the Mac.
