<script setup lang="ts">
import type { RuntimePathsView, SettingSource } from '#shared/types/appSettings'

defineProps<{
  paths: RuntimePathsView
  sharedMode: boolean
  tinyDomain: string
  tinyDomainSource?: SettingSource
  sourceLabel: (source: SettingSource | undefined) => string
}>()
</script>

<template>
  <UiPanel id="settings-paths" class="scroll-mt-20 lg:scroll-mt-6">
    <h2 class="text-base font-semibold tracking-tight">Paths (read-only)</h2>
    <p class="mt-1 text-sm text-muted">Must match compose volumes / bind; change via compose, not here.</p>
    <dl class="mt-3 grid gap-2 font-mono text-xs md:grid-cols-[10rem_minmax(0,1fr)]">
      <dt class="text-muted">ACMEDNS_DATA_ROOT</dt>
      <dd class="break-all text-ink">{{ paths.dataRoot || '—' }}</dd>
      <dt class="text-muted">LETSENCRYPT_DIR</dt>
      <dd class="break-all text-ink">{{ paths.letsencryptDir || '—' }}</dd>
      <dt class="text-muted">config.cfg</dt>
      <dd class="break-all text-ink">{{ paths.configCfg || '—' }}</dd>
      <dt class="text-muted">app-settings</dt>
      <dd class="break-all text-ink">{{ paths.appSettings || '—' }}</dd>
      <template v-if="sharedMode">
        <dt class="text-muted">ACMEDNS_TINY_DOMAIN</dt>
        <dd class="break-all text-ink">
          {{ tinyDomain || '—' }}
          <span v-if="tinyDomainSource" class="text-muted"> ({{ sourceLabel(tinyDomainSource) }})</span>
        </dd>
      </template>
      <dt class="text-muted">ACME_DNS_LISTEN</dt>
      <dd class="break-all text-ink">{{ paths.acmeDnsListen || '—' }}</dd>
      <dt class="text-muted">HOST</dt>
      <dd class="break-all text-ink">{{ paths.host || '—' }}</dd>
      <dt class="text-muted">NITRO_HOST</dt>
      <dd class="break-all text-ink">{{ paths.nitroHost || '—' }}</dd>
    </dl>
  </UiPanel>
</template>
