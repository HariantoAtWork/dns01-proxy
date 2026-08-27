<script setup lang="ts">
import type { ParsedDomainsLine } from '#shared/types/certs'

const { authZone, cnameTarget } = useSharedMode()

const { data: domainsFile, status } = useFetch<{ lines?: ParsedDomainsLine[] }>('/api/certs/domains', {
  key: 'shared-mode-dns-domains',
})

const lines = computed(() => domainsFile.value?.lines ?? [])

const apexes = computed(() => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines.value) {
    const apex = line.certName
    if (!apex || seen.has(apex)) {
      continue
    }
    seen.add(apex)
    out.push(apex)
  }
  return out
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <header>
      <h1 class="text-2xl font-semibold tracking-tight">DNS setup</h1>
      <p class="mt-1 max-w-[60ch] text-sm text-muted">
        Shared mode — no registration. Add certificate lines on
        <NuxtLink to="/certs" class="text-ink underline-offset-2 hover:underline">Certificates</NuxtLink>,
        then publish one CNAME per apex at your DNS provider (Cloudflare: DNS only).
      </p>
    </header>

    <SharedTinySummary />

    <UiPanel accent>
      <h2 class="text-base font-semibold tracking-tight">Auth zone</h2>
      <p class="mt-1 text-sm text-muted">
        Every apex challenge CNAME targets
        <UiCopyable v-if="cnameTarget" inline :value="cnameTarget" label="Auth zone" />.
        Any <span class="font-mono text-ink">*.{{ authZone }}</span> query is accepted for TXT.
      </p>
      <p class="mt-2 font-mono text-sm text-ink">
        _acme-challenge.example.com. IN CNAME {{ cnameTarget }}.
      </p>
    </UiPanel>

    <div v-if="status === 'pending'" class="h-40 animate-pulse bg-panel" style="border-radius: var(--radius-panel)" />

    <UiEmptyState
      v-else-if="!apexes.length"
      title="No certificate lines yet"
      action-label="Open Certificates"
      to="/certs"
    >
      Add a line such as <span class="font-mono text-ink">mdstn.com *.mdstn.com</span> to domains.txt, then return here for copy-paste CNAME rows.
    </UiEmptyState>

    <div v-else class="flex flex-col gap-6">
      <CnameRecipe
        v-for="apex in apexes"
        :key="apex"
        :domain="apex"
        :fulldomain="cnameTarget"
        shared-target
        compact
      />
    </div>
  </div>
</template>
