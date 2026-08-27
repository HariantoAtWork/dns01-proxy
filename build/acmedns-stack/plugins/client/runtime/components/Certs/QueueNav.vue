<script setup lang="ts">
import {
  PhCircle as Circle,
  PhQueue as Queue,
} from '@phosphor-icons/vue'
import {
  jobLabel,
  transportClass,
  transportDotClass,
} from '#shared/utils/certsUi'

const dialogId = useId()
const { open, toggle } = useCertQueueModal()
const toasts = useToasts()
const {
  certJob,
  certQueue,
  transport,
  transportLabel,
  jobActionPending,
  cancelJob,
  resumeJob,
  rerunJob,
  deleteJob,
  useGlobalLifecycle,
} = useCertQueueLive()

useGlobalLifecycle()

const hasQueue = computed(() =>
  Boolean(certQueue.value.running)
  || certQueue.value.queued.length > 0
  || certQueue.value.cancelled.length > 0,
)

const queueSummary = computed(() => {
  if (certQueue.value.running) {
    const job = certQueue.value.running
    const progress = job.taskTotal
      ? ` ${job.taskIndex ?? 0}/${job.taskTotal}`
      : ''
    return `Running${progress}`
  }
  if (certQueue.value.queued.length) {
    const count = certQueue.value.queued.length
    return `${count} queued`
  }
  if (certQueue.value.cancelled.length) {
    return `${certQueue.value.cancelled.length} cancelled`
  }
  return 'Queue'
})

const badgeCount = computed(() => {
  let count = certQueue.value.queued.length
  if (certQueue.value.running) {
    count += 1
  }
  return count
})

type JobQueueAction = 'cancel' | 'resume' | 'rerun' | 'delete'

async function onJobAction(action: JobQueueAction, id: number) {
  jobActionPending.value = true
  try {
    if (action === 'cancel') {
      await cancelJob(id)
      toasts.info(`Job #${id} cancelled`, 'Queue')
    }
    else if (action === 'resume') {
      await resumeJob(id)
      toasts.ok(`Job #${id} resumed`, 'Queue')
    }
    else if (action === 'rerun') {
      await rerunJob(id)
      toasts.ok(`Job #${id} re-queued from start`, 'Queue')
    }
    else {
      await deleteJob(id)
      toasts.info(`Job #${id} deleted`, 'Queue')
    }
  }
  catch (caught) {
    const errors: Record<JobQueueAction, string> = {
      cancel: 'Cancel failed',
      resume: 'Resume failed',
      rerun: 'Re-run failed',
      delete: 'Delete failed',
    }
    toasts.error(caught instanceof Error ? caught.message : errors[action])
  }
  finally {
    jobActionPending.value = false
  }
}
</script>

<template>
  <div>
    <button
      type="button"
      class="relative inline-flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-sm text-muted transition-colors hover:bg-panel hover:text-ink md:px-3 md:py-2"
      :class="[
        open && 'bg-panel text-ink',
        hasQueue && 'text-ink',
      ]"
      :aria-expanded="open"
      :aria-pressed="open"
      aria-haspopup="dialog"
      :aria-controls="dialogId"
      aria-label="Certificate job queue"
      @click="toggle"
    >
      <Queue :size="16" weight="regular" aria-hidden="true" />
      <span class="hidden sm:inline">{{ queueSummary }}</span>
      <span
        v-if="badgeCount > 0"
        class="absolute -right-0.5 -top-0.5 inline-flex min-w-[1rem] items-center justify-center rounded-full bg-signal px-1 text-[10px] font-semibold leading-4 text-signal-ink sm:static sm:ml-0.5"
        aria-hidden="true"
      >
        {{ badgeCount }}
      </span>
      <Circle
        :size="8"
        weight="fill"
        class="hidden sm:inline"
        aria-hidden="true"
        :class="transportDotClass(transport)"
      />
    </button>

    <UiModal :id="dialogId" v-model:open="open" title="Certificate job queue" size="lg">
      <p class="max-w-[65ch] text-sm text-muted">
        Live updates from the certificate SSE stream. Apply and renewal jobs run one at a time;
        cancelled jobs can be resumed or re-run from the start.
      </p>

      <p class="mt-3 flex items-center gap-2 text-xs" :class="transportClass(transport)">
        <Circle :size="8" weight="fill" aria-hidden="true" :class="transportDotClass(transport)" />
        <span>{{ transportLabel }}</span>
      </p>

      <div v-if="certJob.running && !certQueue.running" class="mt-3 text-xs text-signal">
        Job {{ jobLabel(certJob.id!, certJob.source!, certJob.mode!) }}
        <span v-if="certJob.taskTotal"> — {{ certJob.taskIndex ?? 0 }}/{{ certJob.taskTotal }}</span>
        <span v-if="certJob.currentCert"> · {{ certJob.currentCert }}</span>
      </div>

      <div v-if="hasQueue" class="mt-4">
        <CertsJobPanel
          :queue="certQueue"
          :pending="jobActionPending"
          bare
          @cancel="onJobAction('cancel', $event)"
          @resume="onJobAction('resume', $event)"
          @rerun="onJobAction('rerun', $event)"
          @delete="onJobAction('delete', $event)"
        />
      </div>

      <div
        v-else
        class="mt-4 border border-dashed border-rule bg-paper px-4 py-8 text-center"
        style="border-radius: var(--radius-input)"
      >
        <p class="text-sm font-medium text-ink">Queue is empty</p>
        <p class="mt-1 text-sm text-muted">
          Apply or issue a certificate from the Certificates page to start a job.
        </p>
        <UiButton class="mt-4" to="/certs">
          Open Certificates
        </UiButton>
      </div>
    </UiModal>
  </div>
</template>
