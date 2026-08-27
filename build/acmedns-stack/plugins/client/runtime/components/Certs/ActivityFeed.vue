<script setup lang="ts">
import type { CertActivityEntry } from '#shared/types/certs'
import {
  activityLevelClass,
  activitySourceClass,
  activitySourceLabel,
  formatTime,
} from '#shared/utils/certsUi'

export type ActivityLogFilter = 'all' | 'acme' | 'live' | 'staging'

const logFilter = defineModel<ActivityLogFilter>('logFilter', { required: true })

const { entries } = defineProps<{
  entries: CertActivityEntry[]
}>()

const filteredActivity = computed(() => {
  const list = entries
  if (logFilter.value === 'acme') {
    return list.filter(e => e.source === 'acme')
  }
  if (logFilter.value === 'live') {
    return list.filter(e => e.mode === 'production')
  }
  if (logFilter.value === 'staging') {
    return list.filter(e => e.mode === 'staging')
  }
  return list
})
</script>

<template>
  <UiDisclosure title="Let's Encrypt log" :open="true">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <span class="text-xs text-muted">Show:</span>
      <div class="inline-flex flex-wrap rounded-[6px] border border-rule p-0.5">
        <button
          type="button"
          class="rounded-[4px] px-2.5 py-1 text-xs transition-colors"
          :class="logFilter === 'acme' ? 'bg-panel text-ink' : 'text-muted hover:text-ink'"
          @click="logFilter = 'acme'"
        >
          ACME
        </button>
        <button
          type="button"
          class="rounded-[4px] px-2.5 py-1 text-xs transition-colors"
          :class="logFilter === 'live' ? 'bg-panel text-ink' : 'text-muted hover:text-ink'"
          @click="logFilter = 'live'"
        >
          Live
        </button>
        <button
          type="button"
          class="rounded-[4px] px-2.5 py-1 text-xs transition-colors"
          :class="logFilter === 'staging' ? 'bg-panel text-ink' : 'text-muted hover:text-ink'"
          @click="logFilter = 'staging'"
        >
          Staging
        </button>
        <button
          type="button"
          class="rounded-[4px] px-2.5 py-1 text-xs transition-colors"
          :class="logFilter === 'all' ? 'bg-panel text-ink' : 'text-muted hover:text-ink'"
          @click="logFilter = 'all'"
        >
          All
        </button>
      </div>
    </div>
    <p v-if="!filteredActivity.length" class="text-sm text-muted">
      ACME communication with Let's Encrypt appears here during Apply or renewal — HTTP requests,
      dns-01 challenges, and validation. Also in <span class="font-mono">docker logs acmedns-stack</span>
      (lines prefixed <span class="font-mono">[live/acme]</span> or <span class="font-mono">[staging/acme]</span>).
    </p>
    <ul v-else class="max-h-[420px] space-y-1 overflow-y-auto font-mono text-xs">
      <li
        v-for="entry in filteredActivity"
        :key="entry.id"
        :class="activityLevelClass(entry.level)"
      >
        <span class="text-muted">{{ formatTime(entry.at) }}</span>
        <span class="mx-1" :class="activitySourceClass(entry)">[{{ activitySourceLabel(entry) }}]</span>
        <span v-if="entry.certName" class="text-ink">{{ entry.certName }}:</span>
        {{ entry.message }}
      </li>
    </ul>
  </UiDisclosure>
</template>
