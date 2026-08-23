<script setup lang="ts">
import type { CertActivityEntry, CertRateLimit, DomainsDnsCheck, LetsEncryptDirectoryMode } from '#shared/types/certs'
import { useDocumentVisibility, useNow } from '@vueuse/core'
import { PhArrowsClockwise as ArrowsClockwise, PhCertificate as Certificate, PhCircle as Circle, PhFloppyDisk as FloppyDisk, PhTrash as Trash } from '@phosphor-icons/vue'
import { useCertLiveStream } from '#client/composables/useCertLiveStream'

useHead({ title: 'Certificates' })

const toasts = useToasts()
const { copyText } = useClipboardCopy()
const {
  text,
  parsed,
  statusEntries,
  directoryMode,
  acmeEnabled,
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
  saveDomains,
  recheckDomainsDns,
  loadStatus,
  loadActivity,
  refresh,
  apply,
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
const logFilter = ref<'all' | 'acme'>('acme')
const visibility = useDocumentVisibility()
const now = useNow({ interval: 1000 })

const filteredActivity = computed(() => {
  if (logFilter.value === 'acme') {
    return activityEntries.value.filter(e => e.source === 'acme')
  }
  return activityEntries.value
})

const activeRateLimits = computed(() =>
  rateLimits.value
    .filter(l => l.mode === directoryMode.value && Date.parse(l.until) > now.value.getTime())
    .sort((a, b) => Date.parse(a.until) - Date.parse(b.until)),
)

const hasQueue = computed(() =>
  certJob.value.running
  || certQueue.value.queued.length > 0
  || certQueue.value.cancelled.length > 0,
)

const jobActionPending = ref(false)
const dnsRecheckPending = ref(false)

async function onCancelJob(id: number) {
  jobActionPending.value = true
  try {
    await cancelJob(id)
    toasts.info(`Job #${id} cancelled`, 'Queue')
    await refresh()
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Cancel failed')
  }
  finally {
    jobActionPending.value = false
  }
}

async function onResumeJob(id: number) {
  jobActionPending.value = true
  try {
    await resumeJob(id)
    toasts.ok(`Job #${id} resumed`, 'Queue')
    await refresh()
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Resume failed')
  }
  finally {
    jobActionPending.value = false
  }
}

async function onRerunJob(id: number) {
  jobActionPending.value = true
  try {
    await rerunJob(id)
    toasts.ok(`Job #${id} re-queued from start`, 'Queue')
    await refresh()
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Re-run failed')
  }
  finally {
    jobActionPending.value = false
  }
}

function canResumeJob(job: { completedCount?: number }) {
  return (job.completedCount ?? 0) > 0
}

function dnsChecksForLine(lineNo: number) {
  return parsed.value?.dnsChecks?.filter(check => check.line === lineNo) ?? []
}

function dnsCheckLabel(status: DomainsDnsCheck['status']) {
  switch (status) {
    case 'ok': return 'OK'
    case 'missing': return 'Missing'
    case 'mismatch': return 'Mismatch'
    case 'no_account': return 'No account'
    case 'error': return 'Error'
    default: return 'Pending'
  }
}

function dnsCheckClass(status: DomainsDnsCheck['status']) {
  switch (status) {
    case 'ok': return 'text-signal'
    case 'no_account': return 'text-muted'
    case 'pending': return 'text-muted'
    default: return 'text-danger'
  }
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

function copyDnsRecordName(check: DomainsDnsCheck) {
  void copyText(check.name, 'DNS record name')
}

async function onDeleteJob(id: number) {
  jobActionPending.value = true
  try {
    await deleteJob(id)
    toasts.info(`Job #${id} deleted`, 'Queue')
    await refresh()
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Delete failed')
  }
  finally {
    jobActionPending.value = false
  }
}

function jobLabel(id: number, source: string, mode: string) {
  return `#${id} ${source} (${mode})`
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

async function onTrash(certName: string) {
  try {
    await trashCert(certName, directoryMode.value === 'staging' ? 'staging' : 'live')
    toasts.ok(`Moved ${certName} to trash`)
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Trash failed')
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'ok': return 'OK'
    case 'missing': return 'Missing'
    case 'drift': return 'SAN drift'
    case 'orphan': return 'Orphan'
    default: return status
  }
}

function activityLevelClass(level: string) {
  switch (level) {
    case 'error': return 'text-danger'
    case 'warn': return 'text-muted'
    default: return 'text-ink'
  }
}

function activitySourceClass(source: string) {
  return source === 'acme' ? 'text-signal' : 'text-muted'
}

function transportDotClass(mode: typeof transport.value) {
  switch (mode) {
    case 'live': return 'text-live'
    case 'polling': return 'text-signal'
    case 'connecting': return 'text-muted animate-pulse'
    default: return 'text-muted'
  }
}

function transportClass(mode: typeof transport.value) {
  switch (mode) {
    case 'live': return 'text-live'
    case 'polling': return 'text-signal'
    case 'connecting': return 'text-muted'
    default: return 'text-muted'
  }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString()
}

function formatRemaining(untilIso: string) {
  const ms = Date.parse(untilIso) - now.value.getTime()
  if (ms <= 0) {
    return 'ready'
  }
  const total = Math.max(0, Math.ceil(ms / 1000))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const parts: string[] = []
  if (days > 0) {
    parts.push(`${days}d`)
  }
  if (days > 0 || hours > 0) {
    parts.push(`${hours}h`)
  }
  if (days > 0 || hours > 0 || minutes > 0) {
    parts.push(`${minutes}m`)
  }
  parts.push(`${seconds}s`)
  return parts.join(' ')
}

function rateLimitLabel(limit: CertRateLimit) {
  const who = limit.scope === 'account'
    ? `Account (${limit.mode})`
    : (limit.certName || 'Certificate')
  return `${who}: ${formatRemaining(limit.until)} left · until ${formatTime(limit.until)}`
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
        <UiButton to="/certs/last-saved" variant="ghost" size="sm">
          <FloppyDisk :size="14" weight="regular" aria-hidden="true" />
          Last Saved
        </UiButton>
        <UiButton to="/certs/trash" variant="ghost" size="sm">
          <Trash :size="14" weight="regular" aria-hidden="true" />
          Trash
        </UiButton>
      </div>
    </div>

    <UiPanel v-if="activeRateLimits.length">
      <h2 class="text-sm font-semibold text-danger">
        Let's Encrypt rate limit
      </h2>
      <p class="mt-1 text-xs text-muted">
        Cooldown from HTTP 429 / Retry-After. Stored on disk so it survives refresh and reboot.
      </p>
      <ul class="mt-3 space-y-2 font-mono text-xs">
        <li
          v-for="limit in activeRateLimits"
          :key="limit.id"
          class="rounded-[6px] border border-danger/30 px-3 py-2 text-danger"
        >
          <p>{{ rateLimitLabel(limit) }}</p>
          <p v-if="limit.detail" class="mt-1 text-[11px] text-muted">
            {{ limit.detail }}
            <span v-if="limit.endpoint"> · {{ limit.endpoint }}</span>
          </p>
        </li>
      </ul>
    </UiPanel>

    <UiPanel v-if="hasQueue">
      <h2 class="text-sm font-semibold text-ink">Job queue</h2>
      <p class="mt-1 text-xs text-muted">
        Each Apply or renewal is a batch session with its mode fixed at queue time.
        Cancelled jobs can be resumed where they left off, or re-run from the first certificate.
      </p>
      <ul class="mt-3 space-y-2 font-mono text-xs">
        <li
          v-if="certQueue.running"
          class="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-signal px-3 py-2 text-ink"
        >
          <div>
            <span class="text-signal">Running</span>
            {{ jobLabel(certQueue.running.id, certQueue.running.source, certQueue.running.mode) }}
            <span v-if="certQueue.running.taskTotal" class="font-semibold text-signal">
              {{ certQueue.running.taskIndex ?? 0 }}/{{ certQueue.running.taskTotal }}
            </span>
            <span v-if="certQueue.running.currentCert" class="text-muted"> — {{ certQueue.running.currentCert }}</span>
            <span v-if="certQueue.running.cancelRequested" class="ml-2 text-muted">(stopping…)</span>
          </div>
          <div class="flex gap-1">
            <UiButton
              variant="ghost"
              size="sm"
              :disabled="jobActionPending || certQueue.running.cancelRequested"
              @click="onCancelJob(certQueue.running.id)"
            >
              Cancel
            </UiButton>
            <UiButton
              variant="ghost"
              size="sm"
              :disabled="jobActionPending"
              @click="onDeleteJob(certQueue.running.id)"
            >
              Delete
            </UiButton>
          </div>
        </li>
        <li
          v-for="job in certQueue.queued"
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
            <UiButton variant="ghost" size="sm" :disabled="jobActionPending" @click="onCancelJob(job.id)">
              Cancel
            </UiButton>
            <UiButton variant="ghost" size="sm" :disabled="jobActionPending" @click="onDeleteJob(job.id)">
              Delete
            </UiButton>
          </div>
        </li>
        <li
          v-for="job in certQueue.cancelled"
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
              :disabled="jobActionPending"
              @click="onResumeJob(job.id)"
            >
              Resume
            </UiButton>
            <UiButton
              variant="ghost"
              size="sm"
              :disabled="jobActionPending"
              @click="onRerunJob(job.id)"
            >
              Re-run
            </UiButton>
            <UiButton variant="ghost" size="sm" :disabled="jobActionPending" @click="onDeleteJob(job.id)">
              Delete
            </UiButton>
          </div>
        </li>
      </ul>
    </UiPanel>

    <UiPanel>
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
        <div class="flex items-center gap-2">
          <span class="text-xs uppercase tracking-wide text-muted">Directory</span>
          <div class="inline-flex rounded-[6px] border border-rule p-0.5">
            <button
              type="button"
              class="rounded-[4px] px-2.5 py-1 text-xs transition-colors"
              :class="directoryMode === 'production' ? 'bg-panel text-ink' : 'text-muted hover:text-ink'"
              :disabled="pending"
              @click="onMode('production')"
            >
              Production
            </button>
            <button
              type="button"
              class="rounded-[4px] px-2.5 py-1 text-xs transition-colors"
              :class="directoryMode === 'staging' ? 'bg-panel text-ink' : 'text-muted hover:text-ink'"
              :disabled="pending"
              @click="onMode('staging')"
            >
              Staging
            </button>
          </div>
          <span
            v-if="!acmeEnabled"
            class="rounded-[4px] border border-danger px-2 py-0.5 text-xs text-danger"
          >
            ACME off
          </span>
        </div>
        <div class="flex flex-wrap gap-2">
          <UiButton variant="ghost" size="sm" :disabled="pending || !dirty" @click="onSave">
            Save
          </UiButton>
          <UiButton size="sm" :disabled="pending || dirty || !acmeEnabled" @click="onApply(false)">
            Apply
          </UiButton>
          <UiButton variant="ghost" size="sm" :disabled="pending || dirty || !acmeEnabled" @click="onApply(true)">
            Force re-issue
          </UiButton>
        </div>
      </div>

      <label class="mt-3 block">
        <span class="sr-only">domains.txt</span>
        <textarea
          v-model="text"
          class="min-h-[220px] w-full resize-y rounded-[6px] border border-rule bg-paper p-3 font-mono text-sm text-ink outline-none focus:border-signal"
          spellcheck="false"
          :disabled="pending"
        />
      </label>

      <UiDisclosure v-if="parsed?.lines?.length" title="Parsed lines" :open="true" class="mt-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-xs text-muted">
            Public CNAME checks for <span class="font-mono text-ink">_acme-challenge</span> names
          </p>
          <UiButton
            variant="ghost"
            size="sm"
            :disabled="pending || dnsRecheckPending"
            @click="onRecheckDns"
          >
            <ArrowsClockwise
              :size="14"
              weight="regular"
              aria-hidden="true"
              :class="dnsRecheckPending && 'animate-spin'"
            />
            Recheck DNS
          </UiButton>
        </div>
        <ul class="mt-3 space-y-3">
          <li
            v-for="line in parsed.lines"
            :key="`${line.line}-${line.certName}`"
            class="rounded-[6px] border border-rule p-3"
          >
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <p class="font-mono text-sm text-ink">
                {{ line.certName }}
                <span class="text-muted">(line {{ line.line }})</span>
              </p>
            </div>
            <p class="mt-1 font-mono text-xs text-muted">
              SANs: {{ line.expanded.join(', ') }}
            </p>
            <ul v-if="dnsChecksForLine(line.line).length" class="mt-3 space-y-2 border-t border-rule pt-3">
              <li
                v-for="check in dnsChecksForLine(line.line)"
                :key="check.name"
                class="font-mono text-xs"
              >
                <span
                  class="mr-2 rounded-[4px] border border-rule px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                  :class="dnsCheckClass(check.status)"
                >
                  {{ dnsCheckLabel(check.status) }}
                </span>
                <button
                  v-if="check.status === 'mismatch'"
                  type="button"
                  class="cursor-copy text-ink hover:text-signal"
                  :title="`Copy ${check.name}`"
                  @click="copyDnsRecordName(check)"
                >
                  {{ check.name }}
                </button>
                <span v-else class="text-ink">{{ check.name }}</span>
                <span class="text-muted"> → {{ check.expected || '—' }}</span>
                <span v-if="check.actual && check.status === 'mismatch'" class="text-danger">
                  (found {{ check.actual }})
                </span>
                <span v-if="check.message && check.status !== 'ok'" class="text-muted">
                  — {{ check.message }}
                </span>
              </li>
            </ul>
          </li>
        </ul>
      </UiDisclosure>

      <p v-if="dirty" class="mt-2 text-xs text-muted">
        Unsaved changes — Save before Apply.
      </p>
      <pre v-if="error" class="mt-2 whitespace-pre-wrap text-xs text-danger">{{ error }}</pre>
    </UiPanel>

    <UiPanel>
      <h2 class="text-sm font-semibold text-ink">
        Status ({{ directoryMode === 'staging' ? 'staging/' : 'live/' }})
      </h2>
      <div v-if="!statusEntries.length" class="mt-3 text-sm text-muted">
        No certificates indexed yet.
      </div>
      <ul v-else class="mt-3 divide-y divide-rule">
        <li
          v-for="entry in statusEntries"
          :key="entry.certName"
          class="flex flex-wrap items-center justify-between gap-2 py-3"
        >
          <div class="min-w-0">
            <p class="font-mono text-sm text-ink">
              {{ entry.certName }}
              <span
                class="ml-2 rounded-[4px] border border-rule px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted"
              >{{ statusLabel(entry.status) }}</span>
              <span
                v-if="certJob.running && certJob.currentCert === entry.certName"
                class="ml-2 rounded-[4px] border border-signal px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-signal"
              >
                <span v-if="certJob.taskTotal">{{ certJob.taskIndex }}/{{ certJob.taskTotal }}</span>
                <span v-else>Working…</span>
              </span>
            </p>
            <p v-if="entry.notAfter" class="mt-0.5 text-xs text-muted">
              Expires {{ formatTime(entry.notAfter) }}
            </p>
            <p v-if="entry.sansOnDisk?.length" class="mt-0.5 font-mono text-[11px] text-muted">
              On disk: {{ entry.sansOnDisk.join(', ') }}
            </p>
            <p v-if="entry.lastError" class="mt-0.5 text-xs text-danger">
              Last error: {{ entry.lastError }}
            </p>
            <p v-if="entry.rateLimitedUntil && Date.parse(entry.rateLimitedUntil) > now.getTime()" class="mt-0.5 text-xs text-danger">
              Rate limited · {{ formatRemaining(entry.rateLimitedUntil) }} left
              <span class="text-muted"> (until {{ formatTime(entry.rateLimitedUntil) }})</span>
            </p>
          </div>
          <UiButton
            v-if="entry.tree !== 'none'"
            variant="ghost"
            size="sm"
            :disabled="pending || certJob.running"
            @click="onTrash(entry.certName)"
          >
            Trash
          </UiButton>
        </li>
      </ul>
    </UiPanel>

    <UiDisclosure title="Let's Encrypt log" :open="true">
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <span class="text-xs text-muted">Show:</span>
        <div class="inline-flex rounded-[6px] border border-rule p-0.5">
          <button
            type="button"
            class="rounded-[4px] px-2.5 py-1 text-xs transition-colors"
            :class="logFilter === 'acme' ? 'bg-panel text-ink' : 'text-muted hover:text-ink'"
            @click="logFilter = 'acme'"
          >
            Let's Encrypt
          </button>
          <button
            type="button"
            class="rounded-[4px] px-2.5 py-1 text-xs transition-colors"
            :class="logFilter === 'all' ? 'bg-panel text-ink' : 'text-muted hover:text-ink'"
            @click="logFilter = 'all'"
          >
            All
          </button>
        </div>
      </div>
      <p v-if="!filteredActivity.length" class="text-sm text-muted">
        ACME communication with Let's Encrypt appears here during Apply or renewal — HTTP requests,
        dns-01 challenges, and validation. Also in <span class="font-mono">docker logs acmedns-client</span>
        (lines prefixed <span class="font-mono">[acme]</span>).
      </p>
      <ul v-else class="max-h-[420px] space-y-1 overflow-y-auto font-mono text-xs">
        <li
          v-for="entry in filteredActivity"
          :key="entry.id"
          :class="activityLevelClass(entry.level)"
        >
          <span class="text-muted">{{ formatTime(entry.at) }}</span>
          <span class="mx-1" :class="activitySourceClass(entry.source)">[{{ entry.source }}]</span>
          <span v-if="entry.certName" class="text-ink">{{ entry.certName }}:</span>
          {{ entry.message }}
        </li>
      </ul>
    </UiDisclosure>

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
  </div>
</template>
