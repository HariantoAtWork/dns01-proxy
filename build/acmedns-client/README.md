# ACME DNS client

Nuxt 4 UI for `clientstorage.json`. Registers acme-dns accounts, prints the CNAME, checks public DNS, and stores the login that Certbot reads.

## Local

```bash
cp .env.example .env
bun install
bun run dev
```

UI: http://localhost:3000

`ACMEDNS_URL` is called from the Nuxt server, not the browser. Inside Docker that is `http://acmedns-server`. On the host, set it to a reachable acme-dns API.

Storage defaults to `data/clientstorage.json`.

## Stack

Parent compose builds this image and serves it on http://localhost:82. Volume `acmedns-client` is `/app/data`.
