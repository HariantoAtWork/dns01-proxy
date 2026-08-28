<script setup lang="ts">
import type { CertBatchSummary } from '#shared/types/certs'
import {
  certBatchSummaryStatusClass,
  certBatchSummaryStatusLabel,
  certBatchSummaryTitle,
} from '#shared/utils/certBatchSummary'
import { formatTime } from '#shared/utils/certsUi'
import { PhCaretDown as CaretDown, PhTrash as Trash } from '@phosphor-icons/vue'

const { summary, open = false } = defineProps<{
  summary: CertBatchSummary
  open?: boolean
}>()

const emit = defineEmits<{
  delete: []
}>()
</script>

<template>
  <details
    class="ui-disclosure group border border-rule bg-panel"
    style="border-radius: var(--radius-panel)"
    :open="open || undefined"
  >
    <summary
      class="flex cursor-pointer list-none items-center gap-2 px-1 py-1 marker:content-none md:gap-3 md:px-4 md:py-3 [&::-webkit-details-marker]:hidden"
    >
      <CaretDown
        :size="16"
        weight="bold"
        class="shrink-0 text-muted transition-transform group-open:rotate-180"
        aria-hidden="true"
      />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-ink">
          {{ formatTime(summary.executedAt) }}
        </p>
        <p class="truncate font-mono text-[11px] text-muted">
          {{ certBatchSummaryTitle(summary) }}
        </p>
      </div>
      <span
        class="shrink-0 rounded-[4px] border border-rule px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
        :class="certBatchSummaryStatusClass(summary.status)"
      >
        {{ certBatchSummaryStatusLabel(summary.status) }}
      </span>
      <UiButton
        variant="ghost"
        size="sm"
        class="shrink-0"
        aria-label="Delete summary"
        @click.stop.prevent="emit('delete')"
      >
        <Trash :size="14" weight="regular" aria-hidden="true" />
      </UiButton>
    </summary>
    <div class="space-y-3 border-t border-rule px-1 py-1 md:space-y-4 md:px-4 md:py-4">
      <p v-if="summary.error" class="text-xs text-danger">
        {{ summary.error }}
      </p>
      <p class="font-mono text-[11px] text-muted">
        Job {{ summary.jobId }}
        <span v-if="summary.force"> · Force Apply</span>
        <span v-if="summary.taskTotal"> · {{ summary.taskTotal }} cert(s)</span>
      </p>
      <CertsJobTaskList
        v-if="summary.tasks.length"
        :tasks="summary.tasks"
      />
      <p v-else class="text-xs text-muted">
        No certificate task details were captured for this batch.
      </p>
    </div>
  </details>
</template>
