<template>
  <article class="prose-runbook mx-auto max-w-[68ch]">
    <h1 class="text-3xl font-semibold tracking-tight">How this store works</h1>
    <p class="mt-4 text-muted">
      This UI writes <span class="font-mono text-ink">clientstorage.json</span>. Certbot in this stack reads that file and talks to acme-dns. Let's Encrypt only looks up the public CNAME.
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
      <li>Open Register and enter the hostname you want a certificate for.</li>
      <li>Keep the server URL as <span class="font-mono text-ink">http://acmedns-server</span> when this app runs in the compose stack, or point it at a public acme-dns.</li>
      <li>Register creates a new acme-dns account (username, password, fulldomain).</li>
      <li>Publish the CNAME on the real DNS, then Validate or Skip.</li>
      <li>Save. Without a save, the new account is not in the JSON file.</li>
    </ol>

    <h2 class="mt-10 text-xl font-semibold">CNAME shape</h2>
    <pre class="mt-3 overflow-x-auto border border-rule bg-panel p-4 font-mono text-sm">_acme-challenge.example.com. IN CNAME &lt;fulldomain&gt;.</pre>
    <p class="mt-3 text-muted">
      Name is always <span class="font-mono text-ink">_acme-challenge</span> plus your domain. Type is CNAME. Value is the fulldomain from registration.
    </p>
    <p class="mt-3 text-muted">
      Apex and <span class="font-mono text-ink">*.example.com</span> share that one CNAME. A nested name such as
      <span class="font-mono text-ink">oib.example.com</span> needs
      <span class="font-mono text-ink">_acme-challenge.oib.example.com</span> as well. Point it at the same fulldomain if those names sit on one grouped certificate.
    </p>

    <h2 class="mt-10 text-xl font-semibold">Validation</h2>
    <p class="mt-3 text-muted">
      The app asks public resolvers (Cloudflare, Google, and one more) every 15 seconds, up to 20 tries. You can skip and save anyway if you know the record is coming.
    </p>

    <h2 class="mt-10 text-xl font-semibold">Stored fields</h2>
    <p class="mt-3 text-muted">
      Home lists domains. Open one to copy the CNAME, reveal username and password, check the CNAME again, test <span class="font-mono text-ink">/update</span>, or delete the JSON entry. Deleting here does not delete the acme-dns account on the server.
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
      Username and password are the acme-dns API login. If they leave this file, you cannot fetch them back. Copy with care. The volume is shared with Certbot as read-only.
    </p>
  </article>
</template>
