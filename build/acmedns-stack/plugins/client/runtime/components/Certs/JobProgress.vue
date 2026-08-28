<script setup lang="ts">
import type { AcmeRequestItem } from '#shared/types/certs'
import { jobProgressParts } from '#shared/utils/jobProgress'

const { job, showCert = true, compact = false } = defineProps<{
  job: {
    taskIndex?: number
    taskTotal?: number
    requests?: AcmeRequestItem[]
    currentCert?: string
  }
  showCert?: boolean
  compact?: boolean
}>()

const parts = computed(() => jobProgressParts(job))
</script>

<template>
  <span
    v-if="parts.task || parts.request"
    :class="compact
      ? 'font-semibold'
      : 'font-semibold text-signal'"
  >
    <span v-if="parts.task">{{ parts.task }}</span>
    <span v-if="parts.request">
      <span v-if="parts.task"> · </span>{{ parts.request }}
      <span
        v-if="parts.requestLabel"
        :class="compact ? 'opacity-80' : 'font-normal text-muted'"
      >
        {{ compact ? ` ${parts.requestLabel}` : ` ${parts.requestLabel}` }}
      </span>
    </span>
  </span>
  <span v-if="showCert && parts.cert" class="text-muted"> — {{ parts.cert }}</span>
</template>
