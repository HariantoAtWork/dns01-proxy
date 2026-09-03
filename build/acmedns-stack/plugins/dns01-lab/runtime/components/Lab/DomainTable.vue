<script setup lang="ts">
import type { CertJobQueueSnapshot, CertJobStatus } from '#shared/types/certs'
import type { LabStatusEntry } from '#lab-shared/types/lab'
import { certInFlightOrQueued, formatTime } from '#shared/utils/certsUi'
import { PhLightning as Lightning } from '@phosphor-icons/vue'

const {
  pending,
  dirty,
  statusEntries,
  certJob,
  certQueue,
  issuingCerts,
} = defineProps<{
  pending: boolean
  dirty: boolean
  statusEntries: LabStatusEntry[]
  certJob: CertJobStatus
  certQueue: CertJobQueueSnapshot
  issuingCerts: string[]
}>()

const emit = defineEmits<{
  run: [certName: string, force: boolean]
}>()

function statusBadge(entry: LabStatusEntry) {
  if (entry.ok === true) {
    return { label: 'passed', class: 'border-live/40 text-live' }
  }
  if (entry.ok === false) {
    return { label: 'failed', class: 'border-danger/40 text-danger' }
  }
  if (entry.inLabDomainsFile) {
    return { label: 'ready', class: 'border-rule text-muted' }
  }
  return { label: 'orphan', class: 'border-rule text-muted' }
}

function isRunDisabled(entry: LabStatusEntry) {
  return dirty
    || pending
    || !entry.inLabDomainsFile
    || certInFlightOrQueued(entry.certName, issuingCerts, certJob, certQueue)
}

function runButtonLabel(entry: LabStatusEntry) {
  if (issuingCerts.includes(entry.certName)) {
    return 'Queuing…'
  }
  if (certInFlightOrQueued(entry.certName, issuingCerts, certJob, certQueue)) {
    return 'Queued'
  }
  return 'Run'
}
</script>

<template>
  <UiPanel>
    <div>
      <h2 class="text-sm font-semibold text-ink">Lab status</h2>
      <p class="mt-1 text-xs text-muted">
        Run queues a DNS-01 lab job in the shared certificate queue. Force run skips DNS preflight. Real TXT publish and authoritative TXT online checks; fake ACME order and LE validate.
      </p>
    </div>
    <div v-if="!statusEntries.length" class="mt-3 text-sm text-muted">
      Add lines to <span class="font-mono text-ink">lab-domains.txt</span> and save.
    </div>
    <ul v-else class="mt-3 divide-y divide-rule">
      <li
        class="flex items-center justify-between gap-4 py-2 text-xs text-muted"
        aria-hidden="true"
      >
        <span>Domain</span>
        <span class="shrink-0">Run · Force run</span>
      </li>
      <li
        v-for="entry in statusEntries"
        :key="entry.certName"
        class="flex items-start justify-between gap-4 py-3"
      >
        <div class="min-w-0">
          <p class="font-mono text-sm text-ink">
            {{ entry.certName }}
            <span
              class="ml-2 rounded-[4px] border px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
              :class="statusBadge(entry).class"
            >{{ statusBadge(entry).label }}</span>
            <span
              v-if="certJob.running && certJob.currentCert === entry.certName"
              class="ml-2 rounded-[4px] border border-signal px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-signal"
            >
              <CertsJobProgress :job="certJob" :show-cert="false" compact />
            </span>
          </p>
          <p v-if="entry.lastRunAt" class="mt-0.5 text-xs text-muted">
            Last run {{ formatTime(entry.lastRunAt) }}
          </p>
          <p v-if="entry.message" class="mt-0.5 text-xs" :class="entry.ok === false ? 'text-danger' : 'text-muted'">
            {{ entry.message }}
          </p>
        </div>
        <div
          v-if="entry.inLabDomainsFile"
          class="inline-flex shrink-0 rounded-[6px] border border-rule p-0.5"
          role="group"
          :aria-label="`Run lab for ${entry.certName}`"
        >
          <button
            type="button"
            class="rounded-[4px] px-2.5 py-1 text-xs transition-colors hover:brightness-105 disabled:opacity-50"
            :class="isRunDisabled(entry) ? 'bg-panel text-muted' : 'bg-signal text-signal-ink'"
            :disabled="isRunDisabled(entry)"
            @click="emit('run', entry.certName, false)"
          >
            <span class="inline-flex items-center gap-1">
              <Lightning :size="14" weight="regular" aria-hidden="true" />
              {{ runButtonLabel(entry) }}
            </span>
          </button>
          <button
            type="button"
            class="rounded-[4px] border-l border-rule px-2.5 py-1 text-xs text-ink transition-colors hover:bg-panel disabled:opacity-50"
            :disabled="isRunDisabled(entry)"
            @click="emit('run', entry.certName, true)"
          >
            Force run
          </button>
        </div>
      </li>
    </ul>
  </UiPanel>
</template>
