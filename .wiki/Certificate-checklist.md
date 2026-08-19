# Certificate checklist

For a name such as `mdstn.com` / `*.mdstn.com`:

1. Register **`mdstn.com`** in acmedns-client **before** Certbot runs. The wildcard reuses that apex account. Nested names (`oib.mdstn.com`, `*.oib.mdstn.com`) need their own row if their `_acme-challenge` CNAME is not the apex fulldomain.
2. At the real DNS for `mdstn.com`:  
   `CNAME _acme-challenge.mdstn.com` → the `fulldomain` in `clientstorage.json`.  
   NXDOMAIN on `_acme-challenge.mdstn.com` means this record is missing or wrong. Opening 53 on the auth server does not create it.
3. At Cloudflare/registrar for `uti.email`: NS/A glue for `dns.uti.email` to the public IP, **grey cloud**. Must match `domain` / `records` in `config.cfg`.
4. Firewall/router: **UDP+TCP 53** to the host that actually runs `acmedns-server` (not “whatever has Docker on the LAN” if DMZ points elsewhere).
5. `domains.txt` lists the names. Restart `acmedns-letsencrypt` after storage and CNAMEs are in place.

Hook message `No acme-dns account for …` means the **container’s** `clientstorage.json` (the shared volume, not a stray copy on disk) has no matching key. That is separate from port 53.

From outside the house (cellular, not LAN DNS):

```bash
dig NS dns.uti.email
dig A dns.uti.email
dig TXT _acme-challenge.mdstn.com
```

The last one should follow the CNAME into `….dns.uti.email`. If `dig @84.86.220.240 A <uuid>.dns.uti.email` times out or answers from Synology’s resolver, public 53 is not acme-dns on the Mac.
