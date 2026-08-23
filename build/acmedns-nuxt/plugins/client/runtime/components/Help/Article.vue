<template>
  <article class="prose-runbook mx-auto max-w-[68ch]">
    <h1 class="text-3xl font-semibold tracking-tight">How this store works</h1>
    <p class="mt-4 text-muted">
      This UI writes <span class="font-mono text-ink">clientstorage.json</span> and issues certificates from
      <span class="font-mono text-ink">domains.txt</span> (Certs page). Let's Encrypt only looks up the public CNAME.
    </p>

    <h2 class="mt-10 text-xl font-semibold">Public internet</h2>
    <p class="mt-3 text-muted">
      The header Internet toggle opens a modal with the public IPv4 and IPv6 addresses the internet sees for this host and this browser.
      Host addresses are this container's outbound path; use those for the acme-dns A/AAAA glue.
      If IPv6 only appears under this browser, Docker is probably IPv4-only.
      If two echo services disagree, you may have more than one WAN; port 53 must land on the address that actually answers.
    </p>

    <h2 class="mt-10 text-xl font-semibold">Register a domain</h2>
    <ol class="mt-3 list-decimal space-y-2 pl-5 text-muted">
      <li>Open Register and enter the <strong>line apex</strong> (e.g. <span class="font-mono text-ink">mdstn.com</span>) — not each nested wildcard.</li>
      <li>Keep the server URL as <span class="font-mono text-ink">http://acmedns-server</span> when this app runs in the compose stack, or <span class="font-mono text-ink">http://auth.uti.email</span> from the NAS. <span class="font-mono text-ink">https://auth.acme-dns.io</span> still works, but that public service only keeps two TXT slots per account (<span class="font-mono text-ink">mdstn.com *.mdstn.com</span>). Nested wildcards on one UUID need this stack’s 100-slot server.</li>
      <li>Register creates a new acme-dns account (username, password, fulldomain).</li>
      <li>Publish the CNAME on the real DNS, then Validate or Skip.</li>
      <li>Save. Without a save, the new account is not in the JSON file.</li>
    </ol>

    <h2 class="mt-10 text-xl font-semibold">Grouped and nested wildcards</h2>
    <p class="mt-3 text-muted">
      Put all names on one <span class="font-mono text-ink">domains.txt</span> line — order does not matter.
      Open <strong class="font-medium text-ink">Certs</strong>, Save to validate, then Apply.
      Nested wildcards imply parent wildcards on the certificate. The issuer reuses the apex registration for nested SANs.
      Production PEMs land under <span class="font-mono text-ink">live/</span>; Staging uses <span class="font-mono text-ink">staging/</span> and never overwrites live.
      That grouping needs this stack’s 100-slot server. On <span class="font-mono text-ink">auth.acme-dns.io</span> stay at one apex plus one wildcard per account.
    </p>

    <h2 class="mt-10 text-xl font-semibold">CNAME shape</h2>
    <p class="mt-3 text-muted">
      Every row is <span class="font-mono text-ink">_acme-challenge.&lt;host&gt;</span> CNAME a target.
      Apex and <span class="font-mono text-ink">*.example.com</span> share one name.
      Nested wildcards chain to that name. Proven for <span class="font-mono text-ink">mdstn.com</span>:
    </p>
    <CnameRecipe
      class="mt-4"
      embedded
      domain="mdstn.com"
      fulldomain="87eb4f67-8cbb-4477-805d-4c2c6ca0caa3.auth.uti.email"
    />

    <h2 class="mt-10 text-xl font-semibold">Validation</h2>
    <p class="mt-3 text-muted">
      <strong class="font-medium text-ink">Validate CNAME</strong> asks public resolvers every 15 seconds (up to 20 tries) whether
      <span class="font-mono text-ink">_acme-challenge.&lt;domain&gt;</span> points at your fulldomain. You can skip and save anyway if you know the record is coming.
    </p>

    <h2 class="mt-10 text-xl font-semibold">Stored fields</h2>
    <p class="mt-3 text-muted">
      Home lists domains. Open one to copy the CNAME, reveal username and password, check the CNAME again, or delete the JSON entry. Deleting here does not delete the acme-dns account on the server.
    </p>

    <h2 class="mt-10 text-xl font-semibold">Backup and restore</h2>
    <p class="mt-3 text-muted">
      Open Backup to copy the live file or one hostname into
      <span class="font-mono text-ink">{data root}/acmedns-client/backups</span>.
      You can also download the live <span class="font-mono text-ink">CLIENTSTORAGE_DATA</span>
      file, or upload a <span class="font-mono text-ink">clientstorage.json</span> to replace it
      (you will confirm if live storage already has hostnames).
      Full restore replaces <span class="font-mono text-ink">clientstorage.json</span>.
      Domain restore merges that hostname and asks before overwrite.
      Deleting a backup only removes the copy, not the live store.
    </p>

    <h2 class="mt-10 text-xl font-semibold">Keep the secrets</h2>
    <p class="mt-3 text-muted">
      Username and password are the acme-dns API login. If they leave this file, you cannot fetch them back. Copy with care.
      The same volume is read when issuing certificates.
    </p>
  </article>
</template>
