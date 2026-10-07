<script setup lang="ts">
import type { CertJobQueueSnapshot } from '#shared/types/certs'
import { canResumeJob, jobLabel } from '#shared/utils/certsUi'

const { queue, pending, bare = false } = defineProps<{
  queue: CertJobQueueSnapshot
  pending: boolean
  bare?: boolean
}>()

const emit = defineEmits<{
  cancel: [id: number]
  resume: [id: number]
  rerun: [id: number]
  delete: [id: number]
}>()

const hasQueue = computed(() =>
  Boolean(queue.running)
  || queue.queued.length > 0
  || queue.cancelled.length > 0,
)
</script>

<template>
  <UiPanel v-if="!bare && hasQueue">
    <h2 class="text-sm font-semibold text-ink">Job queue</h2>
    <p class="mt-1 text-xs text-muted">
      Each Apply, renewal, or DNS-01 lab run is a batch session. Only one job runs at a time because all share live acme-dns TXT.
      Cancelled jobs can be resumed where they left off, or re-run from the first certificate.
    </p>
    <ul class="mt-3 space-y-2 font-mono text-xs">
      <li
        v-if="queue.running"
        class="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-signal px-3 py-2 text-ink"
      >
        <div>
          <span class="text-signal">Running</span>
          {{ jobLabel(queue.running.id, queue.running.source, queue.running.mode) }}
          <CertsJobProgress :job="queue.running" />
          <CertsJobTaskList
            v-if="queue.running.tasks?.length"
            :tasks="queue.running.tasks"
          />
          <span v-if="queue.running.cancelRequested" class="ml-2 text-muted">(stopping…)</span>
        </div>
        <div class="flex gap-1">
          <UiButton
            variant="ghost"
            size="sm"
            :disabled="pending || queue.running.cancelRequested"
            @click="emit('cancel', queue.running.id)"
          >
            Cancel
          </UiButton>
          <UiButton
            variant="ghost"
            size="sm"
            :disabled="pending"
            @click="emit('delete', queue.running.id)"
          >
            Delete
          </UiButton>
        </div>
      </li>
      <li
        v-for="job in queue.queued"
        :key="job.id"
        class="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-rule px-3 py-2 text-muted"
      >
        <div>
          <span class="text-ink">Queued</span>
          {{ jobLabel(job.id, job.source, job.mode) }}
          <span v-if="job.taskTotal" class="text-muted"> · {{ job.taskTotal }} cert(s)</span>
          <span v-else-if="job.certNames?.length" class="text-muted"> · {{ job.certNames.length }} cert(s)</span>
        </div>
        <div class="flex gap-1">
          <UiButton variant="ghost" size="sm" :disabled="pending" @click="emit('cancel', job.id)">
            Cancel
          </UiButton>
          <UiButton variant="ghost" size="sm" :disabled="pending" @click="emit('delete', job.id)">
            Delete
          </UiButton>
        </div>
      </li>
      <li
        v-for="job in queue.cancelled"
        :key="`cancelled-${job.id}`"
        class="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-dashed border-rule px-3 py-2 text-muted"
      >
        <div>
          <span class="text-ink">Cancelled</span>
          {{ jobLabel(job.id, job.source, job.mode) }}
          <span v-if="job.taskTotal && (job.completedCount ?? job.taskIndex)" class="text-muted">
            · {{ job.completedCount ?? job.taskIndex }}/{{ job.taskTotal }} done
          </span>
        </div>
        <div class="flex gap-1">
          <UiButton
            v-if="canResumeJob(job)"
            size="sm"
            :disabled="pending"
            @click="emit('resume', job.id)"
          >
            Resume
          </UiButton>
          <UiButton
            variant="ghost"
            size="sm"
            :disabled="pending"
            @click="emit('rerun', job.id)"
          >
            Re-run
          </UiButton>
          <UiButton variant="ghost" size="sm" :disabled="pending" @click="emit('delete', job.id)">
            Delete
          </UiButton>
        </div>
      </li>
    </ul>
  </UiPanel>

  <ul v-else-if="bare && hasQueue" class="space-y-2 font-mono text-xs">
    <li
      v-if="queue.running"
      class="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-signal px-3 py-2 text-ink"
    >
      <div>
        <span class="text-signal">Running</span>
        {{ jobLabel(queue.running.id, queue.running.source, queue.running.mode) }}
        <CertsJobProgress :job="queue.running" />
        <CertsJobTaskList
          v-if="queue.running.tasks?.length"
          :tasks="queue.running.tasks"
        />
        <span v-if="queue.running.cancelRequested" class="ml-2 text-muted">(stopping…)</span>
      </div>
      <div class="flex gap-1">
        <UiButton
          variant="ghost"
          size="sm"
          :disabled="pending || queue.running.cancelRequested"
          @click="emit('cancel', queue.running.id)"
        >
          Cancel
        </UiButton>
        <UiButton
          variant="ghost"
          size="sm"
          :disabled="pending"
          @click="emit('delete', queue.running.id)"
        >
          Delete
        </UiButton>
      </div>
    </li>
    <li
      v-for="job in queue.queued"
      :key="job.id"
      class="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-rule px-3 py-2 text-muted"
    >
      <div>
        <span class="text-ink">Queued</span>
        {{ jobLabel(job.id, job.source, job.mode) }}
        <span v-if="job.taskTotal" class="text-muted"> · {{ job.taskTotal }} cert(s)</span>
        <span v-else-if="job.certNames?.length" class="text-muted"> · {{ job.certNames.length }} cert(s)</span>
      </div>
      <div class="flex gap-1">
        <UiButton variant="ghost" size="sm" :disabled="pending" @click="emit('cancel', job.id)">
          Cancel
        </UiButton>
        <UiButton variant="ghost" size="sm" :disabled="pending" @click="emit('delete', job.id)">
          Delete
        </UiButton>
      </div>
    </li>
    <li
      v-for="job in queue.cancelled"
      :key="`cancelled-${job.id}`"
      class="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-dashed border-rule px-3 py-2 text-muted"
    >
      <div>
        <span class="text-ink">Cancelled</span>
        {{ jobLabel(job.id, job.source, job.mode) }}
        <span v-if="job.taskTotal && (job.completedCount ?? job.taskIndex)" class="text-muted">
          · {{ job.completedCount ?? job.taskIndex }}/{{ job.taskTotal }} done
        </span>
      </div>
      <div class="flex gap-1">
        <UiButton
          v-if="canResumeJob(job)"
          size="sm"
          :disabled="pending"
          @click="emit('resume', job.id)"
        >
          Resume
        </UiButton>
        <UiButton
          variant="ghost"
          size="sm"
          :disabled="pending"
          @click="emit('rerun', job.id)"
        >
          Re-run
        </UiButton>
        <UiButton variant="ghost" size="sm" :disabled="pending" @click="emit('delete', job.id)">
          Delete
        </UiButton>
      </div>
    </li>
  </ul>
</template>
