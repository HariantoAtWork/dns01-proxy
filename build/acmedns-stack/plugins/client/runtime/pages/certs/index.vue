<script setup lang="ts">
import type { CertActivityEntry, DomainsDnsCheck, LetsEncryptDirectoryMode } from '#shared/types/certs'
import {
  certInFlightOrQueued,
  formatTime,
  jobLabel,
  transportClass,
  transportDotClass,
} from '#shared/utils/certsUi'
import { useDocumentVisibility, useNow } from '@vueuse/core'
import {
  PhArrowsClockwise as ArrowsClockwise,
  PhCertificate as Certificate,
  PhCircle as Circle,
  PhFloppyDisk as FloppyDisk,
  PhTrash as Trash,
} from '@phosphor-icons/vue'
import { useCertLiveStream } from '#client/composables/useCertLiveStream'

useHead({ title: 'Certificates' })

const toasts = useToasts()
const {
  text,
  parsed,
  statusEntries,
  directoryMode,
  acmeEnabled,
  renewSchedulerEnabled,
  applyResults,
  activityEntries,
  rateLimits,
  certJob,
  certQueue,
  lastRefreshedAt,
  error,
  pending,
  refreshing,
  loadDomains,
  loadSettings,
  saveSettings,
  setRenewSchedulerEnabled,
  saveDomains,
  recheckDomainsDns,
  loadStatus,
  loadActivity,
  refresh,
  apply,
  downloadCert,
  trashCert,
  cancelJob,
  resumeJob,
  rerunJob,
  deleteJob,
  applyLiveSnapshot,
  applyLiveActivity,
  applyLiveQueue,
  applyLiveStatus,
  applyLiveRateLimits,
} = useCerts()

const dirty = ref(false)
const loaded = ref(false)
const logFilter = ref<'all' | 'acme' | 'live' | 'staging'>('acme')
const visibility = useDocumentVisibility()
const now = useNow({ interval: 1000 })

const activeRateLimits = computed(() =>
  rateLimits.value
    .filter(l => l.mode === directoryMode.value && Date.parse(l.until) > now.value.getTime())
    .sort((a, b) => Date.parse(a.until) - Date.parse(b.until)),
)

const jobActionPending = ref(false)
const dnsRecheckPending = ref(false)
const downloadPending = ref<string | null>(null)
const issuingCerts = ref<string[]>([])
const actionsMenuOpen = ref<string | null>(null)
const trashConfirmName = ref<string | null>(null)
const trashConfirmOpen = computed({
  get: () => Boolean(trashConfirmName.value),
  set: (open: boolean) => {
    if (!open) {
      trashConfirmName.value = null
    }
  },
})

function requestTrash(certName: string) {
  actionsMenuOpen.value = null
  trashConfirmName.value = certName
}

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
    if (entry.source === 'acme' && entry.level !== 'error') {
      continue
    }
    if (entry.level === 'error') {
      toasts.error(entry.certName ? `${entry.certName}: ${entry.message}` : entry.message, 'Certificate')
    }
    else if (entry.certName && ['Renewed', 'Issued', 'Re-issued (SAN change)'].includes(entry.message)) {
      toasts.ok(`${entry.certName}: ${entry.message}`, 'Certificate')
    }
    else if (entry.source === 'renew' && entry.message.startsWith('Check complete')) {
      toasts.info(entry.message, 'Renewal')
    }
  }
}

const { transport, transportLabel, start: startLive, disconnect: disconnectLive } = useCertLiveStream({
  directoryMode,
  pollBlocked: pending,
  onPoll: async () => {
    await refresh({ notify: notifyNewActivity })
  },
  onSnapshot: data => applyLiveSnapshot(data),
  onActivity: (data, notify) => applyLiveActivity(data, notify ? notifyNewActivity : undefined),
  onQueue: data => applyLiveQueue(data),
  onStatus: data => applyLiveStatus(data),
  onRateLimits: data => applyLiveRateLimits(data),
})

watch(directoryMode, async (mode) => {
  if (!loaded.value) {
    return
  }
  await loadStatus(mode)
})

watch(visibility, (visible) => {
  if (!loaded.value) {
    return
  }
  if (visible) {
    startLive()
  }
  else {
    disconnectLive()
  }
})

onMounted(async () => {
  try {
    await Promise.all([loadDomains(), loadSettings()])
    await loadStatus()
    await loadActivity({ full: true })
    lastRefreshedAt.value = new Date().toISOString()
    loaded.value = true
    if (visibility.value === 'visible') {
      startLive()
    }
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Failed to load certificates')
  }
})

onUnmounted(() => {
  disconnectLive()
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
      toasts.ok('domains.txt saved')
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

async function onMode(mode: LetsEncryptDirectoryMode) {
  try {
    await saveSettings(mode)
    await loadStatus(mode)
    toasts.ok(mode === 'staging' ? 'Staging mode (writes staging/ only)' : 'Production mode (writes live/)')
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Could not change mode')
  }
}

async function onToggleRenewScheduler() {
  const next = !renewSchedulerEnabled.value
  try {
    await setRenewSchedulerEnabled(next)
    toasts.ok(
      next
        ? 'Renew scheduler on — automatic production checks resume'
        : 'Renew scheduler off — manual Apply / Force still work',
    )
    await loadActivity({ full: true })
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Could not update renew scheduler')
  }
}

async function onApply(force = false) {
  try {
    const data = await apply({ force })
    toasts.ok(`Apply queued as job #${data.job.id} (${data.mode}) — watch Live / Job queue`)
    await loadActivity({ full: true })
  }
  catch {
    toasts.error(error.value || 'Apply failed')
  }
}

async function onIssueCert(certName: string, force = false) {
  actionsMenuOpen.value = null
  if (certInFlightOrQueued(certName, issuingCerts.value, certJob.value, certQueue.value)) {
    toasts.info(`${certName} is already queued or running`, 'Certificates')
    return
  }
  issuingCerts.value = [...issuingCerts.value, certName]
  try {
    const data = await apply({ certNames: [certName], force, trackPending: false })
    toasts.ok(
      force
        ? `Force Issue queued for ${certName} (job #${data.job.id})`
        : `Issue queued for ${certName} (job #${data.job.id})`,
      'Certificates',
    )
  }
  catch {
    toasts.error(error.value || `Issue failed for ${certName}`)
  }
  finally {
    issuingCerts.value = issuingCerts.value.filter(name => name !== certName)
  }
}

async function onDownload(certName: string) {
  downloadPending.value = certName
  try {
    await downloadCert(certName)
    toasts.ok(`Downloaded live/${certName}`, 'Certificates')
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Download failed')
  }
  finally {
    downloadPending.value = null
  }
}

async function onTrash(certName: string) {
  try {
    await trashCert(certName, directoryMode.value === 'staging' ? 'staging' : 'live')
    trashConfirmName.value = null
    toasts.ok(`Moved ${certName} to trash`)
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Trash failed')
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
          <Certificate :size="24" weight="regular" aria-hidden="true" />
          Certificates
        </h1>
        <p class="mt-1 text-sm text-muted">
          Edit <span class="font-mono text-ink">domains.txt</span>, save to validate, then Apply to issue.
          Production writes <span class="font-mono">live/</span>; Staging writes <span class="font-mono">staging/</span> only.
          Apply checks challenge CNAMEs first and skips Let's Encrypt when DNS is not ready; Force re-issue bypasses that preflight.
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
            <span v-if="certJob.taskTotal"> — {{ certJob.taskIndex ?? 0 }}/{{ certJob.taskTotal }}</span>
            <span v-if="certJob.currentCert"> · {{ certJob.currentCert }}</span>
            <span v-if="certJob.queueLength"> · {{ certJob.queueLength }} waiting</span>
          </span>
          <span v-else-if="certQueue.queued.length" class="ml-2 text-muted">
            · {{ certQueue.queued.length }} job(s) queued
          </span>
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UiButton variant="ghost" size="sm" :disabled="pending || refreshing" @click="onRefresh">
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

    <CertsRateLimits :limits="activeRateLimits" :now-ms="now.getTime()" />

    <CertsJobPanel
      :queue="certQueue"
      :pending="jobActionPending"
      @cancel="onJobAction('cancel', $event)"
      @resume="onJobAction('resume', $event)"
      @rerun="onJobAction('rerun', $event)"
      @delete="onJobAction('delete', $event)"
    />

    <CertsDomainTable
      v-model:text="text"
      :parsed="parsed"
      :directory-mode="directoryMode"
      :acme-enabled="acmeEnabled"
      :renew-scheduler-enabled="renewSchedulerEnabled"
      :pending="pending"
      :dirty="dirty"
      :error="error"
      :status-entries="statusEntries"
      :cert-job="certJob"
      :cert-queue="certQueue"
      :issuing-certs="issuingCerts"
      :download-pending="downloadPending"
      :actions-menu-open="actionsMenuOpen"
      :dns-recheck-pending="dnsRecheckPending"
      :now-ms="now.getTime()"
      @save="onSave"
      @apply="onApply"
      @mode="onMode"
      @toggle-renew-scheduler="onToggleRenewScheduler"
      @recheck-dns="onRecheckDns"
      @issue="onIssueCert"
      @download="onDownload"
      @trash-request="requestTrash"
      @update:actions-menu-open="actionsMenuOpen = $event"
    />

    <CertsActivityFeed v-model:log-filter="logFilter" :entries="activityEntries" />

    <UiPanel v-if="applyResults.length">
      <h2 class="text-sm font-semibold text-ink">Last Apply</h2>
      <ul class="mt-2 space-y-1 font-mono text-xs">
        <li
          v-for="r in applyResults"
          :key="r.certName"
          :class="r.ok ? 'text-muted' : 'text-danger'"
        >
          {{ r.certName }}: {{ r.message }}
        </li>
      </ul>
    </UiPanel>

    <UiConfirmDialog
      v-model:open="trashConfirmOpen"
      title="Move certificate to trash?"
      confirm-label="Delete"
      cancel-label="Keep"
      danger
      @confirm="trashConfirmName && onTrash(trashConfirmName)"
      @cancel="trashConfirmName = null"
    >
      <p v-if="trashConfirmName">
        Move <span class="font-mono text-ink">{{ trashConfirmName }}</span> from
        {{ directoryMode === 'staging' ? 'staging/' : 'live/' }} to trash. You can restore it from the Trash page.
      </p>
    </UiConfirmDialog>
  </div>
</template>
