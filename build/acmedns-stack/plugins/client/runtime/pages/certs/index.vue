<script setup lang="ts">
import type { CertActivityEntry, DomainsDnsCheck, LetsEncryptDirectoryMode, CertBatchUploadPreview } from '#shared/types/certs'
import {
  certInFlightOrQueued,
  formatTime,
  jobLabel,
  transportClass,
  transportDotClass,
} from '#shared/utils/certsUi'
import { useNow } from '@vueuse/core'
import {
  PhArrowsClockwise as ArrowsClockwise,
  PhCertificate as Certificate,
  PhCircle as Circle,
  PhFloppyDisk as FloppyDisk,
  PhGear as Gear,
  PhTrash as Trash,
} from '@phosphor-icons/vue'

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
const uploadPending = ref<string | null>(null)
const batchDownloadPending = ref(false)
const batchUploadPending = ref(false)
const batchUploadModalOpen = ref(false)
const batchUploadPreview = ref<CertBatchUploadPreview | null>(null)
const uploadTarget = ref<string | null>(null)
const uploadConfirmOpen = ref(false)
const pendingUploadFile = ref<File | null>(null)
const pendingBatchUploadFile = ref<File | null>(null)
const certZipInput = useTemplateRef<HTMLInputElement>('cert-zip-input')
const certBatchZipInput = useTemplateRef<HTMLInputElement>('cert-batch-zip-input')
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

watch(directoryMode, async (mode) => {
  if (!loaded.value) {
    return
  }
  await loadStatus(mode)
})

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
      await refresh({ notify: notifyNewActivity })
    },
    onSnapshot: data => applyLiveSnapshot(data),
    onActivity: (data, notify) => applyLiveActivity(data, notify ? notifyNewActivity : undefined),
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

function onUploadRequest(certName: string) {
  uploadTarget.value = certName
  certZipInput.value?.click()
}

async function performUpload(certName: string, file: File, overwrite: boolean) {
  uploadPending.value = certName
  try {
    await uploadCert(certName, file, overwrite)
    await loadStatus()
    toasts.ok(`Imported live/${certName}`, 'Certificates')
  }
  catch (caught) {
    if (
      caught
      && typeof caught === 'object'
      && 'needsOverwrite' in caught
      && (caught as { needsOverwrite?: boolean }).needsOverwrite
    ) {
      pendingUploadFile.value = file
      uploadTarget.value = certName
      uploadConfirmOpen.value = true
      return
    }
    toasts.error(caught instanceof Error ? caught.message : 'Upload failed')
  }
  finally {
    uploadPending.value = null
  }
}

async function onCertZipSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  const certName = uploadTarget.value
  if (!certName || !file) {
    return
  }

  if (!file.name.toLowerCase().endsWith('.zip')) {
    toasts.error('Choose a .zip file')
    uploadTarget.value = null
    return
  }

  const entry = statusEntries.value.find(item => item.certName === certName)
  if (entry?.liveOnDisk) {
    pendingUploadFile.value = file
    uploadConfirmOpen.value = true
    return
  }

  await performUpload(certName, file, false)
  uploadTarget.value = null
}

async function confirmCertUpload() {
  const file = pendingUploadFile.value
  const certName = uploadTarget.value
  uploadConfirmOpen.value = false
  pendingUploadFile.value = null
  if (!file || !certName) {
    uploadTarget.value = null
    return
  }

  await performUpload(certName, file, true)
  uploadTarget.value = null
}

function cancelCertUpload() {
  uploadConfirmOpen.value = false
  pendingUploadFile.value = null
  uploadTarget.value = null
}

function onBatchUploadRequest() {
  certBatchZipInput.value?.click()
}

async function performBatchUpload(file: File, overwrite: string[]) {
  batchUploadPending.value = true
  try {
    const result = await uploadCertsBatch(file, overwrite)
    await loadStatus()
    toasts.ok(result.message || `Imported ${result.imported?.length ?? 0} certificate(s)`, 'Certificates')
    batchUploadModalOpen.value = false
    batchUploadPreview.value = null
    pendingBatchUploadFile.value = null
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Batch upload failed')
  }
  finally {
    batchUploadPending.value = false
  }
}

async function onBatchZipSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) {
    return
  }

  if (!file.name.toLowerCase().endsWith('.zip')) {
    toasts.error('Choose a .zip file')
    return
  }

  batchUploadPending.value = true
  try {
    const preview = await previewCertsBatch(file)
    if (!preview.conflicts.length) {
      await performBatchUpload(file, [])
      return
    }

    pendingBatchUploadFile.value = file
    batchUploadPreview.value = preview
    batchUploadModalOpen.value = true
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Could not read ZIP')
  }
  finally {
    batchUploadPending.value = false
  }
}

async function onBatchUploadConfirm(overwrite: string[]) {
  const file = pendingBatchUploadFile.value
  if (!file) {
    return
  }
  await performBatchUpload(file, overwrite)
}

function onBatchUploadCancel() {
  batchUploadModalOpen.value = false
  batchUploadPreview.value = null
  pendingBatchUploadFile.value = null
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

    <div
      class="sticky top-12 z-[15] -mx-1 flex items-stretch gap-2 bg-paper/95 px-1 py-1 backdrop-blur-md md:top-16 md:-mx-6 md:px-6"
    >
      <button
        type="button"
        class="inline-flex shrink-0 items-center justify-center rounded-full p-1.5 transition-colors"
        :class="configModalOpen ? 'text-ink' : 'text-muted hover:text-ink'"
        aria-label="Edit domains.txt"
        title="domains.txt and DNS checks"
        :disabled="pending"
        @click="configModalOpen = true"
      >
        <Gear :size="18" weight="regular" aria-hidden="true" />
      </button>
      <CertsEnvironmentTabs
        v-model="certEnvironment"
        class="min-w-0 flex-1"
        :pending="pending"
        :live-acme-off="directoryMode === 'production' && !acmeEnabled"
      />
    </div>

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

    <CertsBatchSummaryBoard />

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
      @download="onDownload"
      @upload="onUploadRequest"
      @batch-download="onBatchDownload"
      @batch-upload="onBatchUploadRequest"
      @trash-request="requestTrash"
      @update:actions-menu-open="actionsMenuOpen = $event"
    />

    <CertsActivityFeed v-model:log-filter="logFilter" :entries="activityEntries" />
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
