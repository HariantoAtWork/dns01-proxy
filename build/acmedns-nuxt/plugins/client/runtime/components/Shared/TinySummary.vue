<script setup lang="ts">
import { PhCopy as Copy } from '@phosphor-icons/vue'

const { sharedMode, authZone, settings, refresh } = useSharedMode()
const { host, load, loading, error } = usePublicIps()
const { copyText } = useClipboardCopy()

const syncing = ref(false)
let syncTimer: ReturnType<typeof setTimeout> | undefined

async function syncZone() {
  if (!sharedMode.value || syncing.value) {
    return
  }
  syncing.value = true
  try {
    await load()
    await $fetch('/api/settings/sync-tiny-zone', { method: 'POST' })
    await refresh()
  }
  catch {
    // Keep showing current settings records if sync fails.
  }
  finally {
    syncing.value = false
  }
}

function queueSync() {
  if (!sharedMode.value) {
    return
  }
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    void syncZone()
  }, 250)
}

watch(sharedMode, (on) => {
  if (on) {
    queueSync()
  }
}, { immediate: true })

watch(
  () => host.value.map(item => item.address).join(','),
  () => queueSync(),
)

watch(
  () => settings.value?.tinyDomain || settings.value?.general?.domain || '',
  () => queueSync(),
)

onBeforeUnmount(() => {
  clearTimeout(syncTimer)
})

const domain = computed(() => {
  const fromSettings = settings.value?.tinyDomain?.trim()
  if (fromSettings) {
    return fromSettings
  }
  return authZone.value || ''
})

const hostIps = computed(() => host.value.map(item => item.address))

const zoneRecords = computed(() => {
  const raw = settings.value?.general?.records || ''
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/)
      return {
        line,
        name: parts[0] || '',
        type: (parts[1] || '').toUpperCase(),
        value: parts.slice(2).join(' '),
      }
    })
})

const zoneText = computed(() => zoneRecords.value.map(row => row.line).join('\n'))
</script>

<template>
  <UiDisclosure
    v-if="sharedMode"
    title="Tiny mode summary"
    :open="true"
  >
    <dl class="grid gap-3 text-sm md:grid-cols-[9rem_minmax(0,1fr)]">
      <dt class="text-muted">Domain</dt>
      <dd class="min-w-0">
        <UiCopyable
          v-if="domain"
          inline
          :value="domain"
          label="ACMEDNS_TINY_DOMAIN"
        />
        <span v-else class="text-muted">—</span>
        <span class="mt-0.5 block text-xs text-muted">ACMEDNS_TINY_DOMAIN · CNAME e.g. _mdstn-com_.{{ authZone || 'auth.zone' }}</span>
      </dd>

      <dt class="text-muted">Public IP</dt>
      <dd class="min-w-0">
        <p v-if="loading" class="text-muted">Detecting…</p>
        <p v-else-if="error" class="text-danger">{{ error?.message || 'Could not detect host public IP' }}</p>
        <ul v-else-if="hostIps.length" class="space-y-1">
          <li v-for="ip in hostIps" :key="ip">
            <UiCopyable inline :value="ip" label="Public IP" />
            <span class="text-xs text-muted"> · this host</span>
          </li>
        </ul>
        <p v-else class="text-muted">—</p>
      </dd>

      <dt class="text-muted">Record zone</dt>
      <dd class="min-w-0">
        <p v-if="loading || syncing" class="text-muted">Writing glue from domain + public IP…</p>
        <template v-else-if="zoneRecords.length">
          <div class="w-fit max-w-full overflow-x-auto border border-rule" style="border-radius: var(--radius-panel)">
            <table class="w-auto border-collapse text-left text-sm">
              <thead>
                <tr class="border-b border-rule bg-paper/60 text-xs uppercase tracking-wide text-muted">
                  <th class="whitespace-nowrap px-3 py-2 font-medium">Name</th>
                  <th class="whitespace-nowrap px-3 py-2 font-medium">Type</th>
                  <th class="whitespace-nowrap px-3 py-2 font-medium">Content</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in zoneRecords"
                  :key="row.line"
                  class="border-b border-rule last:border-b-0"
                >
                  <td class="whitespace-nowrap px-3 py-2 align-top font-mono">
                    <UiCopyable inline :value="row.name" label="Name" />
                  </td>
                  <td class="whitespace-nowrap px-3 py-2 align-top font-mono text-muted">
                    {{ row.type }}
                  </td>
                  <td class="whitespace-nowrap px-3 py-2 align-top font-mono">
                    <UiCopyable inline :value="row.value" label="Content" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <UiButton
              variant="ghost"
              size="sm"
              @click="copyText(zoneText, 'Record zone', $event)"
            >
              <Copy :size="14" weight="regular" aria-hidden="true" />
              Copy all
            </UiButton>
            <span class="text-xs text-muted">Stored in config.cfg and served by DNS</span>
          </div>
        </template>
        <p v-else-if="domain" class="text-muted">Need a public IP to set glue for {{ domain }}.</p>
        <p v-else class="text-muted">Set ACMEDNS_TINY_DOMAIN first.</p>
      </dd>
    </dl>
  </UiDisclosure>
</template>
