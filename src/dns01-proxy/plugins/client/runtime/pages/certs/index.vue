<script setup lang="ts">
import type { LetsEncryptDirectoryMode } from '#shared/types/certs'
import { certInFlightOrQueued } from '#shared/utils/certsUi'
import { useNow } from '@vueuse/core'
import { notifyDnsCheckResult, notifyNewActivity } from '#client/utils/certsPageNotify'

useHead({ title: 'Certificates' })

const toasts = useToasts()
const {
  text,
  parsed,
  statusEntries,
  directoryMode,
  acmeEnabled,
  renewSchedulerEnabled,
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
  downloadCertsBatch,
  uploadCert,
  uploadCertsBatch,
  previewCertsBatch,
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

const {
  transport,
  transportLabel,
  jobActionPending,
  registerPageHooks,
  clearPageHooks,
} = useCertQueueLive()

const { onJobAction } = useCertJobActions({
  jobActionPending,
  cancelJob,
  resumeJob,
  rerunJob,
  deleteJob,
  afterAction: () => refresh(),
})

const {
  uploadPending,
  batchUploadPending,
  batchUploadModalOpen,
  batchUploadPreview,
  uploadTarget,
  uploadConfirmOpen,
  onUploadRequest,
  onCertZipSelected,
  confirmCertUpload,
  cancelCertUpload,
  onBatchUploadRequest,
  onBatchZipSelected,
  onBatchUploadConfirm,
  onBatchUploadCancel,
} = useCertUploadActions({
  statusEntries,
  loadStatus,
  uploadCert,
  uploadCertsBatch,
  previewCertsBatch,
})

type CertEnvironment = 'live' | 'staging'

const dirty = ref(false)
const loaded = ref(false)
const configModalOpen = ref(false)
const certEnvironment = computed<CertEnvironment>({
  get: () => (directoryMode.value === 'staging' ? 'staging' : 'live'),
  set: (value) => {
    void onMode(value === 'staging' ? 'staging' : 'production')
  },
})
const logFilter = ref<'all' | 'acme' | 'live' | 'staging'>('acme')
const now = useNow({ interval: 1000 })

const activeRateLimits = computed(() =>
  rateLimits.value
    .filter(l => l.mode === directoryMode.value && Date.parse(l.until) > now.value.getTime())
    .sort((a, b) => Date.parse(a.until) - Date.parse(b.until)),
)

const dnsRecheckPending = ref(false)
const downloadPending = ref<string | null>(null)
const batchDownloadPending = ref(false)
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

watch(directoryMode, async (mode) => {
  if (!loaded.value) {
    return
  }
  await loadStatus(mode)
})

watch(
  () => certJob.value.running,
  (running, wasRunning) => {
    if (!loaded.value || !wasRunning || running) {
      return
    }
    void loadStatus(directoryMode.value)
  },
)

const certPanelId = computed(() =>
  directoryMode.value === 'staging' ? 'cert-panel-staging' : 'cert-panel-live',
)

const certTabLabelId = computed(() =>
  directoryMode.value === 'staging' ? 'cert-tab-staging' : 'cert-tab-live',
)

onMounted(async () => {
  registerPageHooks({
    directoryMode,
    pollBlocked: pending,
    onPoll: async () => {
      await refresh({ notify: entries => notifyNewActivity(toasts, entries) })
    },
    onSnapshot: data => applyLiveSnapshot(data),
    onActivity: (data, notify) => applyLiveActivity(data, notify ? entries => notifyNewActivity(toasts, entries) : undefined),
    onQueue: data => applyLiveQueue(data),
    onStatus: data => applyLiveStatus(data),
    onRateLimits: data => applyLiveRateLimits(data),
  })

  try {
    await Promise.all([loadDomains(), loadSettings()])
    await loadStatus()
    await loadActivity({ full: true })
    lastRefreshedAt.value = new Date().toISOString()
    loaded.value = true
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Failed to load certificates')
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
      toasts.ok('domains.txt saved')
      notifyDnsCheckResult(toasts, result.dnsChecks)
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
    notifyDnsCheckResult(toasts, checks)
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'DNS recheck failed')
  }
  finally {
    dnsRecheckPending.value = false
  }
}

async function onMode(mode: LetsEncryptDirectoryMode) {
  if (directoryMode.value === mode) {
    return
  }
  try {
    await saveSettings(mode)
    await loadStatus(mode)
    toasts.ok(mode === 'staging' ? 'Staging (writes staging/ only)' : 'Live (writes live/)')
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

async function onBatchDownload() {
  batchDownloadPending.value = true
  try {
    await downloadCertsBatch()
    toasts.ok('Downloaded live-certificates.zip', 'Certificates')
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Batch download failed')
  }
  finally {
    batchDownloadPending.value = false
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
</script>

<template>
  <div class="mx-auto max-w-[1200px] space-y-6 px-1 py-4 md:px-6 md:py-8">
    <CertsPageHeader
      :loaded="loaded"
      :pending="pending"
      :refreshing="refreshing"
      :transport="transport"
      :transport-label="transportLabel"
      :last-refreshed-at="lastRefreshedAt"
      :cert-job="certJob"
      :cert-queue="certQueue"
      @refresh="onRefresh"
    />

    <CertsToolbar
      v-model="certEnvironment"
      :pending="pending"
      :config-open="configModalOpen"
      :directory-mode="directoryMode"
      :acme-enabled="acmeEnabled"
      @update:config-open="configModalOpen = $event"
    />

    <div
      :id="certPanelId"
      role="tabpanel"
      :aria-labelledby="certTabLabelId"
    >
    <CertsRateLimits :limits="activeRateLimits" :now-ms="now.getTime()" />

    <CertsJobPanel
      :queue="certQueue"
      :pending="jobActionPending"
      @cancel="onJobAction('cancel', $event)"
      @resume="onJobAction('resume', $event)"
      @rerun="onJobAction('rerun', $event)"
      @delete="onJobAction('delete', $event)"
    />

    <div class="space-y-6">
      <CertsDomainTable
        :directory-mode="directoryMode"
        :acme-enabled="acmeEnabled"
        :pending="pending"
        :dirty="dirty"
        :status-entries="statusEntries"
        :cert-job="certJob"
        :cert-queue="certQueue"
        :issuing-certs="issuingCerts"
        :download-pending="downloadPending"
        :upload-pending="uploadPending"
        :batch-download-pending="batchDownloadPending"
        :batch-upload-pending="batchUploadPending"
        :actions-menu-open="actionsMenuOpen"
        :now-ms="now.getTime()"
        @issue="onIssueCert"
        @issue-all="onApply"
        @download="onDownload"
        @upload="onUploadRequest"
        @batch-download="onBatchDownload"
        @batch-upload="onBatchUploadRequest"
        @trash-request="requestTrash"
        @update:actions-menu-open="actionsMenuOpen = $event"
      />

      <CertsBatchSummaryBoard />

      <CertsActivityFeed v-model:log-filter="logFilter" :entries="activityEntries" />
    </div>
    </div>

    <CertsConfigModal
      v-model:open="configModalOpen"
      v-model:text="text"
      :parsed="parsed"
      :directory-mode="directoryMode"
      :acme-enabled="acmeEnabled"
      :renew-scheduler-enabled="renewSchedulerEnabled"
      :pending="pending"
      :dirty="dirty"
      :error="error"
      :dns-recheck-pending="dnsRecheckPending"
      @save="onSave"
      @apply="onApply"
      @toggle-renew-scheduler="onToggleRenewScheduler"
      @recheck-dns="onRecheckDns"
    />

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

    <input
      ref="cert-zip-input"
      type="file"
      accept=".zip,application/zip"
      class="sr-only"
      aria-label="Upload certificate ZIP"
      @change="onCertZipSelected"
    >

    <input
      ref="cert-batch-zip-input"
      type="file"
      accept=".zip,application/zip"
      class="sr-only"
      aria-label="Upload batch certificate ZIP"
      @change="onBatchZipSelected"
    >

    <UiConfirmDialog
      v-model:open="uploadConfirmOpen"
      title="Replace live certificate?"
      confirm-label="Replace"
      cancel-label="Cancel"
      danger
      @confirm="confirmCertUpload"
      @cancel="cancelCertUpload"
    >
      <p v-if="uploadTarget">
        Replace <span class="font-mono text-ink">live/{{ uploadTarget }}</span> with the uploaded ZIP.
        The current PEMs are copied to last-saved before overwrite.
      </p>
    </UiConfirmDialog>

    <CertsBatchUploadModal
      v-model:open="batchUploadModalOpen"
      :preview="batchUploadPreview"
      :pending="batchUploadPending"
      @confirm="onBatchUploadConfirm"
      @cancel="onBatchUploadCancel"
    />
  </div>
</template>
