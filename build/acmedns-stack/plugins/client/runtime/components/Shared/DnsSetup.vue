<script setup lang="ts">
import { PhCopy as Copy } from '@phosphor-icons/vue'
import type { ParsedDomainsLine } from '#shared/types/certs'
import { apexCnameExample, zoneCnameLine } from '#client/utils/domain'
import { tinyApexFulldomain } from '#shared/utils/tinyModeDns'

const { authZone } = useSharedMode()
const { copyText } = useClipboardCopy()

const { data: domainsFile, status } = useFetch<{ lines?: ParsedDomainsLine[] }>('/api/certs/domains', {
  key: 'shared-mode-dns-domains',
})

const lines = computed(() => domainsFile.value?.lines ?? [])

const rows = computed(() => {
  const seen = new Set<string>()
  const out: Array<{
    apex: string
    name: string
    cloudflareName: string
    target: string
    zoneLine: string
  }> = []
  for (const line of lines.value) {
    const apex = line.certName
    if (!apex || seen.has(apex)) {
      continue
    }
    seen.add(apex)
    const fulldomain = authZone.value ? tinyApexFulldomain(apex, authZone.value) : ''
    const record = apexCnameExample(apex, fulldomain)
    out.push({
      apex,
      name: record.name,
      cloudflareName: record.cloudflareName,
      target: record.target,
      zoneLine: zoneCnameLine(apex, fulldomain),
    })
  }
  return out
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <header>
      <h1 class="text-2xl font-semibold tracking-tight">DNS setup</h1>
      <p class="mt-1 max-w-[60ch] text-sm text-muted">
        One CNAME per apex (DNS only). Add lines on
        <NuxtLink to="/certs" class="text-ink underline-offset-2 hover:underline">Certificates</NuxtLink>.
      </p>
    </header>

    <SharedTinySummary />

    <div v-if="status === 'pending'" class="h-40 animate-pulse bg-panel" style="border-radius: var(--radius-panel)" />

    <UiEmptyState
      v-else-if="!rows.length"
      title="No certificate lines yet"
      action-label="Open Certificates"
      to="/certs"
    >
      Add a line such as <span class="font-mono text-ink">mdstn.com *.mdstn.com</span> to domains.txt, then return here for copy-paste CNAME rows.
    </UiEmptyState>

    <div
      v-else
      class="w-fit max-w-full overflow-x-auto border border-rule"
      style="border-radius: var(--radius-panel)"
    >
      <table class="w-auto border-collapse text-left text-sm">
        <thead>
          <tr class="border-b border-rule bg-paper/60 text-xs uppercase tracking-wide text-muted">
            <th class="whitespace-nowrap px-3 py-2 font-medium">Apex</th>
            <th class="whitespace-nowrap px-3 py-2 font-medium">Name</th>
            <th class="whitespace-nowrap px-3 py-2 font-medium">Content</th>
            <th class="whitespace-nowrap px-3 py-2 font-medium">
              <span class="sr-only">Copy</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.apex"
            class="border-b border-rule last:border-b-0"
          >
            <td class="whitespace-nowrap px-3 py-2 align-top font-mono">
              <UiCopyable inline :value="row.apex" label="Apex" />
            </td>
            <td class="min-w-0 px-3 py-2 align-top font-mono">
              <UiCopyable :value="row.name" label="Name" />
              <p class="mt-0.5 font-sans text-xs text-muted">
                Cloudflare:
                <UiCopyable inline :value="row.cloudflareName" label="Cloudflare Name" />
              </p>
            </td>
            <td class="min-w-0 px-3 py-2 align-top font-mono">
              <UiCopyable :value="row.target" label="Content" />
              <p class="mt-0.5 font-sans text-xs text-muted">DNS only</p>
            </td>
            <td class="whitespace-nowrap px-3 py-2 align-top">
              <UiButton
                variant="ghost"
                size="sm"
                @click="copyText(row.zoneLine, 'Apex zone line', $event)"
              >
                <Copy :size="14" weight="regular" aria-hidden="true" />
                Copy
              </UiButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
