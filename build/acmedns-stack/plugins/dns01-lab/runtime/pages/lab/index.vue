<script setup lang="ts">
import type { CertActivityEntry, DomainsDnsCheck } from '#shared/types/certs'
import {
  formatTime,
  jobLabel,
  transportClass,
  transportDotClass,
} from '#shared/utils/certsUi'
import {
  PhArrowsClockwise as ArrowsClockwise,
  PhCircle as Circle,
  PhFlask as Flask,
  PhGear as Gear,
} from '@phosphor-icons/vue'

useHead({ title: 'DNS-01 Lab' })

const toasts = useToasts()
const {
  text,
  parsed,
  statusEntries,
  activityEntries,
  certJob,
  certQueue,
  lastRefreshedAt,
  error,
  pending,
  refreshing,
  loadDomains,
  saveDomains,
  recheckDomainsDns,
  loadStatus,
  loadActivity,
  refresh,
  apply,
  cancelJob,
  resumeJob,
  rerunJob,
  deleteJob,
  applyLiveActivity,
  applyLiveQueue,
} = useLab()

const {
  transport,
  transportLabel,
  jobActionPending,
  registerPageHooks,
  clearPageHooks,
} = useCertQueueLive()

const dirty = ref(false)
const loaded = ref(false)
const configModalOpen = ref(false)
const logFilter = ref<'all' | 'lab'>('all')
const activityLogFilter = ref<'all' | 'acme' | 'live' | 'staging'>('all')
const dnsRecheckPending = ref(false)
const txtPurgePending = ref(false)
const issuingCerts = ref<string[]>([])

function notifyDnsCheckResult(dnsChecks: DomainsDnsCheck[] | undefined) {
  const dnsIssues = dnsChecks?.filter(check => check.status !== 'ok') ?? []
  if (dnsChecks?.length && dnsIssues.length === 0) {
    toasts.ok('All _acme-challenge CNAMEs look good', 'DNS')
  }
  else if (dnsIssues.length) {
    toasts.info(
      `${dnsIssues.length} _acme-challenge CNAME(s) need attention`,
      'DNS',
    )
  }
}

function notifyNewActivity(entries: CertActivityEntry[]) {
  for (const entry of entries) {
    if (entry.source === 'lab') {
      if (entry.level === 'error') {
        toasts.error(entry.certName ? `${entry.certName}: ${entry.message}` : entry.message, 'Lab')
      }
      else if (entry.certName && entry.message.startsWith('Lab passed')) {
        toasts.ok(`${entry.certName}: passed`, 'Lab')
      }
      continue
    }
    if (entry.source === 'acme' && entry.level !== 'error') {
      continue
    }
    if (entry.level === 'error') {
      toasts.error(entry.certName ? `${entry.certName}: ${entry.message}` : entry.message, 'Queue')
    }
  }
}

const filteredActivity = computed(() => {
  if (logFilter.value === 'lab') {
    return activityEntries.value.filter(e => e.source === 'lab')
  }
  return activityEntries.value
})

onMounted(async () => {
  registerPageHooks({
    pollBlocked: pending,
    onPoll: async () => {
      await refresh({ notify: notifyNewActivity })
    },
    onActivity: (data, notify) => applyLiveActivity(data, notify ? notifyNewActivity : undefined),
    onQueue: data => applyLiveQueue(data),
  })

  try {
    await loadDomains()
    await loadStatus()
    await loadActivity({ full: true })
    lastRefreshedAt.value = new Date().toISOString()
    loaded.value = true
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Failed to load lab')
  }
})

onUnmounted(() => {
  clearPageHooks()
})

watch(text, () => {
  if (loaded.value) {
    dirty.value = true
  }
})

async function onRefresh() {
  try {
    await refresh({ full: true })
    toasts.info('Status and activity log updated', 'Refreshed')
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Refresh failed')
  }
}

async function onSave() {
  try {
    const result = await saveDomains()
    if (result.ok) {
      dirty.value = false
      toasts.ok('lab-domain.txt saved')
      notifyDnsCheckResult(result.dnsChecks)
      await loadStatus()
    }
    else {
      toasts.error('Fix validation errors before saving')
    }
  }
  catch {
    toasts.error(error.value || 'Save failed')
  }
}

async function onRecheckDns() {
  dnsRecheckPending.value = true
  try {
    const checks = await recheckDomainsDns()
    notifyDnsCheckResult(checks)
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'DNS recheck failed')
  }
  finally {
    dnsRecheckPending.value = false
  }
}

async function onPurgeTxtSlots() {
  if (!window.confirm('Clear all in-memory acme-dns TXT slots for this server? Active challenges may need a re-run.')) {
    return
  }
  txtPurgePending.value = true
  try {
    const result = await $fetch<{ subdomain: string, cleared: number }>('/api/acmedns/txt/purge', {
      method: 'POST',
      body: {},
    })
    toasts.ok(`Cleared ${result.cleared} TXT slot(s) on ${result.subdomain}`, 'TXT purge')
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'TXT purge failed')
  }
  finally {
    txtPurgePending.value = false
  }
}

async function onApply(force = false) {
  try {
    const data = await apply({ force })
    toasts.ok(`Lab run queued as job #${data.job.id} — watch Job queue`)
    await loadActivity({ full: true })
  }
  catch {
    toasts.error(error.value || 'Run failed')
  }
}

async function onRunCert(certName: string, force = false) {
  if (issuingCerts.value.includes(certName)) {
    toasts.info(`${certName} is already queued or running`, 'Lab')
    return
  }
  issuingCerts.value = [...issuingCerts.value, certName]
  try {
    const data = await apply({ certNames: [certName], force, trackPending: false })
    toasts.ok(
      force
        ? `Force run queued for ${certName} (job #${data.job.id})`
        : `Run queued for ${certName} (job #${data.job.id})`,
      'Lab',
    )
  }
  catch {
    toasts.error(error.value || `Run failed for ${certName}`)
  }
  finally {
    issuingCerts.value = issuingCerts.value.filter(name => name !== certName)
  }
}

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
    await refresh()
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
  <div class="mx-auto max-w-[1200px] space-y-6 px-1 py-4 md:px-6 md:py-8">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="flex items-center gap-2 text-xl font-semibold text-ink md:text-2xl">
          <Flask :size="24" weight="regular" aria-hidden="true" />
          DNS-01 Lab
        </h1>
        <p class="mt-1 text-sm text-muted">
          Edit <span class="font-mono text-ink">lab-domain.txt</span>, save to validate, then Run lab.
          Real TXT publish and authoritative TXT online checks; FAKE ACME order and FAKE LE validate only.
          Shares the certificate job queue so lab and Apply never publish TXT at the same time.
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
          <span v-if="lastRefreshedAt">Last refreshed {{ formatTime(lastRefreshedAt) }}</span>
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
      <UiButton variant="ghost" size="sm" :disabled="pending || refreshing" @click="onRefresh">
        <ArrowsClockwise
          :size="14"
          weight="regular"
          aria-hidden="true"
          :class="refreshing && 'animate-spin'"
        />
        Refresh
      </UiButton>
    </div>

    <div
      class="sticky top-12 z-[15] -mx-1 flex items-stretch gap-2 bg-paper/95 px-1 py-1 backdrop-blur-md md:top-16 md:-mx-6 md:px-6"
    >
      <button
        type="button"
        class="inline-flex shrink-0 items-center justify-center rounded-full p-1.5 transition-colors"
        :class="configModalOpen ? 'text-ink' : 'text-muted hover:text-ink'"
        aria-label="Edit lab-domain.txt"
        title="lab-domain.txt and DNS checks"
        :disabled="pending"
        @click="configModalOpen = true"
      >
        <Gear :size="18" weight="regular" aria-hidden="true" />
      </button>
    </div>

    <CertsJobPanel
      :queue="certQueue"
      :pending="jobActionPending"
      @cancel="onJobAction('cancel', $event)"
      @resume="onJobAction('resume', $event)"
      @rerun="onJobAction('rerun', $event)"
      @delete="onJobAction('delete', $event)"
    />

    <div class="space-y-6">
      <LabDomainTable
        :pending="pending"
        :dirty="dirty"
        :status-entries="statusEntries"
        :cert-job="certJob"
        :cert-queue="certQueue"
        :issuing-certs="issuingCerts"
        @run="onRunCert"
      />

      <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs text-muted">Activity:</span>
          <div class="inline-flex flex-wrap rounded-[6px] border border-rule p-0.5">
            <button
              type="button"
              class="rounded-[4px] px-2.5 py-1 text-xs transition-colors"
              :class="logFilter === 'all' ? 'bg-panel text-ink' : 'text-muted hover:text-ink'"
              @click="logFilter = 'all'"
            >
              All
            </button>
            <button
              type="button"
              class="rounded-[4px] px-2.5 py-1 text-xs transition-colors"
              :class="logFilter === 'lab' ? 'bg-panel text-ink' : 'text-muted hover:text-ink'"
              @click="logFilter = 'lab'"
            >
              Lab
            </button>
          </div>
          <button
            type="button"
            class="rounded-[6px] border border-rule bg-panel px-2.5 py-1 text-xs text-ink transition-colors hover:text-ink disabled:opacity-50"
            :disabled="txtPurgePending || pending"
            @click="onPurgeTxtSlots"
          >
            {{ txtPurgePending ? 'Purging…' : 'Purge local TXT slots' }}
          </button>
        </div>
        <CertsActivityFeed
          v-model:log-filter="activityLogFilter"
          :entries="filteredActivity"
          :show-mode-filters="false"
        />
      </div>
    </div>

    <LabConfigModal
      v-model:open="configModalOpen"
      v-model:text="text"
      :parsed="parsed"
      :pending="pending"
      :dirty="dirty"
      :error="error"
      :dns-recheck-pending="dnsRecheckPending"
      @save="onSave"
      @apply="onApply"
      @recheck-dns="onRecheckDns"
    />
  </div>
</template>
