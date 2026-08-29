<script setup lang="ts">
const { sharedMode, authZone } = useSharedMode()
</script>

<template>
  <article class="prose-runbook mx-auto max-w-[68ch]">
    <h1 class="text-3xl font-semibold tracking-tight">How this store works</h1>
    <p class="mt-4 text-muted">
      <template v-if="sharedMode">
        This stack runs in <strong class="font-medium text-ink">tiny (shared) mode</strong>.
        Add certificate lines on <span class="font-mono text-ink">domains.txt</span> (Certs page),
        publish one CNAME per apex to an encoded label under your auth zone
        (e.g. <span class="font-mono text-ink">_mdstn-com_.{{ authZone || 'auth.uti.email' }}</span>), then Apply.
        No Register step and no
        <span class="font-mono text-ink">clientstorage.json</span> accounts per domain.
      </template>
      <template v-else>
        This UI writes <span class="font-mono text-ink">clientstorage.json</span> and issues certificates from
        <span class="font-mono text-ink">domains.txt</span> (Certs page). Let's Encrypt only looks up the public CNAME.
      </template>
    </p>

    <h2 class="mt-10 text-xl font-semibold">Public internet</h2>
    <p class="mt-3 text-muted">
      The header Internet toggle opens a modal with the public IPv4 and IPv6 addresses the internet sees for this host and this browser,
      plus UDP port 53 probes for your auth zone (local container, echo IP, glue A/AAAA, and delegated nameserver addresses).
      Host addresses are this container's outbound path; use those for the acme-dns A/AAAA glue.
      If IPv6 only appears under this browser, Docker is probably IPv4-only.
      If two echo services disagree, you may have more than one WAN; port 53 must land on the address that actually answers.
      Probes run from inside the container — NAT hairpin can fail even when Let's Encrypt can reach you from outside.
    </p>

    <template v-if="sharedMode">
      <h2 class="mt-10 text-xl font-semibold">DNS setup (tiny mode)</h2>
      <ol class="mt-3 list-decimal space-y-2 pl-5 text-muted">
        <li>Set <span class="font-mono text-ink">ACMEDNS_TINY_DOMAIN</span> (e.g. <span class="font-mono text-ink">{{ authZone || 'auth.uti.email' }}</span>).</li>
        <li>Open <strong class="font-medium text-ink">DNS setup</strong> (<span class="font-mono text-ink">/domains</span>) for CNAME copy-paste rows from <span class="font-mono text-ink">domains.txt</span>.</li>
        <li>At your registrar / Cloudflare: <span class="font-mono text-ink">_acme-challenge.mdstn.com</span> CNAME <span class="font-mono text-ink">_mdstn-com_.{{ authZone || 'auth.uti.email' }}</span> (DNS only) — dots in the apex become hyphens, wrapped in underscores.</li>
        <li>Open <strong class="font-medium text-ink">Certificates</strong>, Save, then Apply. TXT under that label is published automatically.</li>
      </ol>
      <p class="mt-3 text-sm text-muted">
        See <span class="font-mono text-ink">.wiki/Tiny-stack.md</span> in the repo for the full operator guide.
      </p>
    </template>

    <template v-else>
      <h2 class="mt-10 text-xl font-semibold">Register a domain</h2>
      <ol class="mt-3 list-decimal space-y-2 pl-5 text-muted">
        <li>Open Register and enter the <strong>line apex</strong> (e.g. <span class="font-mono text-ink">mdstn.com</span>) — not each nested wildcard.</li>
        <li>Keep the server URL as <span class="font-mono text-ink">http://127.0.0.1</span> or your public auth hostname (e.g. <span class="font-mono text-ink">http://auth.uti.email</span>) when this app runs in the compose stack. You can also register some names on <span class="font-mono text-ink">https://auth.acme-dns.io</span> — the issuer uses each row’s own <span class="font-mono text-ink">server_url</span>. That public service only keeps two TXT slots per account (<span class="font-mono text-ink">mdstn.com *.mdstn.com</span>); nested wildcards on one UUID need this stack’s 100-slot server.</li>
        <li>Register creates a new acme-dns account (username, password, fulldomain).</li>
        <li>Publish the CNAME on the real DNS, then Validate or Skip.</li>
        <li>Save. Without a save, the new account is not in the JSON file.</li>
      </ol>
    </template>

    <h2 class="mt-10 text-xl font-semibold">Grouped and nested wildcards</h2>
    <p class="mt-3 text-muted">
      Put all names on one <span class="font-mono text-ink">domains.txt</span> line — order does not matter.
      Open <strong class="font-medium text-ink">Certs</strong>, Save to validate, then Apply.
      <template v-if="!sharedMode">
        Nested wildcards imply parent wildcards on the certificate. The issuer reuses the apex registration for nested SANs.
      </template>
      Production PEMs land under <span class="font-mono text-ink">live/</span>; Staging uses <span class="font-mono text-ink">staging/</span> and never overwrites live.
      <template v-if="!sharedMode">
        That grouping needs this stack’s 100-slot server. On <span class="font-mono text-ink">auth.acme-dns.io</span> stay at one apex plus one wildcard per account.
      </template>
    </p>

    <h2 class="mt-10 text-xl font-semibold">CNAME shape</h2>
    <p class="mt-3 text-muted">
      Every row is <span class="font-mono text-ink">_acme-challenge.&lt;host&gt;</span> CNAME a target.
      Apex and <span class="font-mono text-ink">*.example.com</span> share one name.
      <template v-if="!sharedMode">
        Nested wildcards chain to that name. Proven for <span class="font-mono text-ink">mdstn.com</span>:
      </template>
      <template v-else>
        In tiny mode the apex target is
        <span class="font-mono text-ink">_mdstn-com_.{{ authZone || 'auth.uti.email' }}</span>
        (encode the apex: dots → hyphens, wrap in underscores). Nested wildcards still chain to the apex challenge.
      </template>
    </p>
    <CnameRecipe
      class="mt-4"
      embedded
      domain="mdstn.com"
      :fulldomain="sharedMode ? `_mdstn-com_.${authZone || 'auth.uti.email'}` : '87eb4f67-8cbb-4477-805d-4c2c6ca0caa3.auth.uti.email'"
      :shared-target="sharedMode"
    />

    <template v-if="!sharedMode">
      <h2 class="mt-10 text-xl font-semibold">Validation</h2>
      <p class="mt-3 text-muted">
        <strong class="font-medium text-ink">Validate CNAME</strong> asks public resolvers every 15 seconds (up to 20 tries) whether
        <span class="font-mono text-ink">_acme-challenge.&lt;domain&gt;</span> points at your fulldomain. You can skip and save anyway if you know the record is coming.
      </p>

      <h2 class="mt-10 text-xl font-semibold">Stored fields</h2>
      <p class="mt-3 text-muted">
        Home shows counts. Domains at <span class="font-mono text-ink">/domains</span> lists accounts with a validity mark (credentials still accepted by that acme-dns server). Open one to copy the CNAME, reveal username and password, check the CNAME again, or delete the JSON entry. Deleting there does not delete the acme-dns account on the server.
      </p>

      <h2 class="mt-10 text-xl font-semibold">Keep the secrets</h2>
      <p class="mt-3 text-muted">
        Username and password are the acme-dns API login. If they leave this file, you cannot fetch them back. Copy with care.
        The same volume is read when issuing certificates.
      </p>
    </template>

    <h2 class="mt-10 text-xl font-semibold">Backup and restore</h2>
    <p class="mt-3 text-muted">
      Open Backup to copy the live file or one hostname into
      <span class="font-mono text-ink">$ACMEDNS_DATA_ROOT/backup</span>.
      <template v-if="!sharedMode">
        You can also download the live <span class="font-mono text-ink">clientstorage.json</span>
        file, or upload a <span class="font-mono text-ink">clientstorage.json</span> to replace it
        (you will confirm if live storage already has hostnames).
        Full restore replaces <span class="font-mono text-ink">clientstorage.json</span>.
        Domain restore merges that hostname and asks before overwrite.
      </template>
      Deleting a backup only removes the copy, not the live store.
    </p>
  </article>
</template>
