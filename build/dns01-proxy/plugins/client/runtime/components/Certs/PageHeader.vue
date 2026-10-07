<script setup lang="ts">
import type { CertJobQueueSnapshot, CertJobStatus } from '#shared/types/certs'
import {
  jobLabel,
  transportClass,
  transportDotClass,
  type CertLiveTransport,
} from '#shared/utils/certsUi'
import {
  PhArrowsClockwise as ArrowsClockwise,
  PhCertificate as Certificate,
  PhCircle as Circle,
  PhFloppyDisk as FloppyDisk,
  PhTrash as Trash,
} from '@phosphor-icons/vue'

const {
  loaded = false,
  pending = false,
  refreshing = false,
  transport,
  transportLabel,
  lastRefreshedAt = null,
  certJob,
  certQueue,
} = defineProps<{
  loaded?: boolean
  pending?: boolean
  refreshing?: boolean
  transport: CertLiveTransport
  transportLabel: string
  lastRefreshedAt?: string | null
  certJob: CertJobStatus
  certQueue: CertJobQueueSnapshot
}>()

const emit = defineEmits<{
  refresh: []
}>()
</script>

<template>
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 class="flex items-center gap-2 text-xl font-semibold text-ink md:text-2xl">
        <Certificate :size="24" weight="regular" aria-hidden="true" />
        Certificates
      </h1>
      <p class="mt-1 text-sm text-muted">
        Edit <span class="font-mono text-ink">domains.txt</span>, save to validate, then Apply to issue.
        Live writes <span class="font-mono">live/</span>; Staging writes <span class="font-mono">staging/</span> only.
        Apply checks challenge CNAMEs on your zone's authoritative nameservers first (Let's Encrypt's dns-01 path) and skips issue when DNS is not ready; Force re-issue bypasses that preflight. Recheck DNS also queries public resolvers for propagation hints.
      </p>
      <p v-if="loaded" class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span
          class="inline-flex items-center gap-1.5"
          :class="transportClass(transport)"
          :title="transportLabel"
        >
          <Circle :size="8" weight="fill" aria-hidden="true" :class="transportDotClass(transport)" />
          <span>{{ transportLabel }}</span>
        </span>
        <span v-if="lastRefreshedAt">Last refreshed <UiFormattedTime :value="lastRefreshedAt" /></span>
        <span v-if="certJob.running" class="text-signal">
          · Job {{ jobLabel(certJob.id!, certJob.source!, certJob.mode!) }}
          <CertsJobProgress :job="certJob" />
          <span v-if="certJob.queueLength"> · {{ certJob.queueLength }} waiting</span>
        </span>
        <span v-else-if="certQueue.queued.length" class="ml-2 text-muted">
          · {{ certQueue.queued.length }} job(s) queued
        </span>
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <UiButton variant="ghost" size="sm" :disabled="pending || refreshing" @click="emit('refresh')">
        <ArrowsClockwise
          :size="14"
          weight="regular"
          aria-hidden="true"
          :class="refreshing && 'animate-spin'"
        />
        Refresh
      </UiButton>
      <div class="inline-flex rounded-[6px] border border-rule p-0.5">
        <NuxtLink
          to="/certs/last-saved"
          class="inline-flex items-center gap-1 rounded-[4px] bg-signal/10 px-2.5 py-1 text-xs text-signal no-underline transition-colors hover:bg-signal/15"
        >
          <FloppyDisk :size="14" weight="regular" aria-hidden="true" />
          Last Saved
        </NuxtLink>
        <NuxtLink
          to="/certs/trash"
          class="inline-flex items-center gap-1 rounded-[4px] border-l border-rule bg-danger/10 px-2.5 py-1 text-xs text-danger no-underline transition-colors hover:bg-danger/15"
        >
          <Trash :size="14" weight="regular" aria-hidden="true" />
          Trash
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
