<script setup lang="ts">
import type {
  CertJobQueueSnapshot,
  CertJobStatus,
  CertStatusEntry,
  DomainsParseResult,
  LetsEncryptDirectoryMode,
} from '#shared/types/certs'
import {
  canIssueCert,
  certInFlightOrQueued,
  dnsCheckClass,
  dnsCheckLabel,
  dnsCheckNeedsCopy,
  dnsChecksForLine,
  formatRemaining,
  formatTime,
  issueDisabled,
  statusLabel,
} from '#shared/utils/certsUi'
import { cloudflareChallengeName } from '#client/utils/domain'
import { PhArrowsClockwise as ArrowsClockwise, PhDotsThreeVertical as Actions, PhDownload as Download, PhLightning as Lightning, PhTrash as Trash, PhUpload as Upload } from '@phosphor-icons/vue'

const text = defineModel<string>('text', { required: true })

const {
  parsed,
  directoryMode,
  acmeEnabled,
  renewSchedulerEnabled,
  pending,
  dirty,
  error,
  statusEntries,
  certJob,
  certQueue,
  issuingCerts,
  downloadPending,
  uploadPending,
  batchDownloadPending = false,
  batchUploadPending = false,
  actionsMenuOpen,
  dnsRecheckPending,
  nowMs,
} = defineProps<{
  parsed: DomainsParseResult | null
  directoryMode: LetsEncryptDirectoryMode
  acmeEnabled: boolean
  renewSchedulerEnabled: boolean
  pending: boolean
  dirty: boolean
  error: string | null
  statusEntries: CertStatusEntry[]
  certJob: CertJobStatus
  certQueue: CertJobQueueSnapshot
  issuingCerts: string[]
  downloadPending: string | null
  uploadPending: string | null
  batchDownloadPending?: boolean
  batchUploadPending?: boolean
  actionsMenuOpen: string | null
  dnsRecheckPending: boolean
  nowMs: number
}>()

const emit = defineEmits<{
  save: []
  apply: [force: boolean]
  mode: [mode: LetsEncryptDirectoryMode]
  'toggle-renew-scheduler': []
  'recheck-dns': []
  issue: [certName: string, force: boolean]
  download: [certName: string]
  upload: [certName: string]
  'batch-download': []
  'batch-upload': []
  'trash-request': [certName: string]
  'update:actionsMenuOpen': [certName: string | null]
}>()

const statusActionsOpen = ref(false)
const liveOnDiskCount = computed(() => statusEntries.filter(entry => entry.liveOnDisk).length)

function showActionsMenu(entry: CertStatusEntry) {
  return entry.tree !== 'none'
    || canIssueCert(entry)
    || entry.inDomainsFile
    || entry.liveOnDisk
}

function setActionsMenuOpen(certName: string, open: boolean) {
  emit('update:actionsMenuOpen', open ? certName : (actionsMenuOpen === certName ? null : actionsMenuOpen))
}

function isIssueDisabled(entry: CertStatusEntry) {
  return issueDisabled(
    entry,
    dirty,
    directoryMode,
    acmeEnabled,
    issuingCerts,
    certJob,
    certQueue,
  )
}

function isCertInFlightOrQueued(certName: string) {
  return certInFlightOrQueued(certName, issuingCerts, certJob, certQueue)
}

function cloudflareNameForCheck(zone: string, lineApex: string) {
  return cloudflareChallengeName(zone, lineApex)
}
</script>

<template>
  <UiPanel>
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
          <span class="text-xs uppercase tracking-wide text-muted">Directory</span>
          <div class="inline-flex rounded-[6px] border border-rule p-0.5">
            <button
              type="button"
              class="rounded-[4px] px-2.5 py-1 text-xs transition-colors"
              :class="directoryMode === 'production' ? 'bg-panel text-ink' : 'text-muted hover:text-ink'"
              :disabled="pending"
              @click="emit('mode', 'production')"
            >
              Production
            </button>
            <button
              type="button"
              class="rounded-[4px] px-2.5 py-1 text-xs transition-colors"
              :class="directoryMode === 'staging' ? 'bg-panel text-ink' : 'text-muted hover:text-ink'"
              :disabled="pending"
              @click="emit('mode', 'staging')"
            >
              Staging
            </button>
          </div>
          <span
            v-if="!acmeEnabled"
            class="rounded-[4px] border border-danger px-2 py-0.5 text-xs text-danger"
          >
            Production ACME off
          </span>
        </div>
        <label
          class="inline-flex cursor-pointer items-center gap-2 rounded-[6px] border px-2.5 py-1 text-xs"
          :class="renewSchedulerEnabled ? 'border-rule text-ink' : 'border-danger text-danger'"
          title="Periodic production renew only. Does not block manual Apply or Force re-issue."
        >
          <input
            type="checkbox"
            class="accent-[var(--signal)]"
            :checked="renewSchedulerEnabled"
            :disabled="pending"
            @click.prevent="emit('toggle-renew-scheduler')"
          >
          Auto renew
          <span class="font-medium">{{ renewSchedulerEnabled ? 'on' : 'off' }}</span>
        </label>
      </div>
      <div class="flex flex-wrap gap-2">
        <UiButton variant="ghost" size="sm" :disabled="pending || !dirty" @click="emit('save')">
          Save
        </UiButton>
        <UiButton
          size="sm"
          :disabled="pending || dirty || (directoryMode === 'production' && !acmeEnabled)"
          @click="emit('apply', false)"
        >
          Apply
        </UiButton>
        <UiButton
          variant="ghost"
          size="sm"
          :disabled="pending || dirty || (directoryMode === 'production' && !acmeEnabled)"
          @click="emit('apply', true)"
        >
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
          Public + authoritative CNAME checks for <span class="font-mono text-ink">_acme-challenge</span> names.
          Apply preflight uses authoritative NS only (Let's Encrypt path).
        </p>
        <UiButton
          variant="ghost"
          size="sm"
          :disabled="pending || dnsRecheckPending"
          @click="emit('recheck-dns')"
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
          <ul v-if="dnsChecksForLine(line.line, parsed.dnsChecks).length" class="mt-3 space-y-2 border-t border-rule pt-3">
            <li
              v-for="check in dnsChecksForLine(line.line, parsed.dnsChecks)"
              :key="check.name"
              class="font-mono text-xs"
            >
              <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span
                  class="rounded-[4px] border border-rule px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                  :class="dnsCheckClass(check.status)"
                >
                  {{ dnsCheckLabel(check.status) }}
                </span>
                <span v-if="!dnsCheckNeedsCopy(check.status)" class="break-all text-ink">{{ check.name }}</span>
                <template v-else>
                  <span class="break-all text-ink">{{ check.name }}</span>
                  <span v-if="check.actual && check.status === 'mismatch'" class="text-danger">
                    (found {{ check.actual }})
                  </span>
                </template>
                <span v-if="check.message && check.status !== 'ok'" class="text-muted">
                  — {{ check.message }}
                </span>
              </div>
              <dl
                v-if="dnsCheckNeedsCopy(check.status) && check.expected"
                class="mt-2 grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 rounded-[6px] border border-rule bg-paper p-2"
              >
                <dt class="text-[10px] uppercase tracking-wide text-muted">Name</dt>
                <dd class="min-w-0">
                  <UiCopyable :value="check.name" label="Name" />
                  <p class="mt-0.5 font-sans text-[11px] text-muted">
                    Cloudflare:
                    <UiCopyable
                      inline
                      :value="cloudflareNameForCheck(check.zone, line.certName)"
                      label="Cloudflare Name"
                    />
                  </p>
                </dd>
                <dt class="text-[10px] uppercase tracking-wide text-muted">Content</dt>
                <dd class="min-w-0">
                  <UiCopyable :value="check.expected" label="Content" />
                </dd>
                <template v-if="check.serverUrl">
                  <dt class="text-[10px] uppercase tracking-wide text-muted">Server URL</dt>
                  <dd class="min-w-0">
                    <UiCopyable :value="check.serverUrl" label="Server URL" />
                  </dd>
                </template>
              </dl>
              <p
                v-else-if="!dnsCheckNeedsCopy(check.status)"
                class="mt-1 break-all text-muted"
              >
                → {{ check.expected || '—' }}
              </p>
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
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-sm font-semibold text-ink">
          Status ({{ directoryMode === 'staging' ? 'staging/' : 'live/' }})
        </h2>
        <p class="mt-1 text-xs text-muted">
          Issue queues one Let's Encrypt job per apex; click several in a row and they run one after another.
          Download, Upload, and Force Issue are in the ⋮ menu.
        </p>
      </div>
      <UiMenu v-model:open="statusActionsOpen" align="right">
        <template #trigger="{ open, toggle, panelId }">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-[6px] border border-rule px-2.5 py-1 text-xs text-ink transition-colors hover:bg-paper"
            :class="open && 'bg-paper'"
            :aria-expanded="open"
            aria-haspopup="menu"
            :aria-controls="panelId"
            aria-label="Certificate actions"
            title="Certificate actions"
            :disabled="pending || certJob.running"
            @click="toggle()"
          >
            <Actions :size="14" weight="regular" aria-hidden="true" />
            Actions
          </button>
        </template>
        <template #default="{ close }">
          <button
            type="button"
            role="menuitem"
            class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink hover:bg-paper disabled:opacity-50"
            :disabled="batchDownloadPending || !liveOnDiskCount"
            @click="close(); emit('batch-download')"
          >
            <Download :size="16" weight="regular" aria-hidden="true" />
            {{ batchDownloadPending ? 'Downloading…' : 'Download all' }}
          </button>
          <button
            type="button"
            role="menuitem"
            class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink hover:bg-paper disabled:opacity-50"
            :disabled="batchUploadPending"
            @click="close(); emit('batch-upload')"
          >
            <Upload :size="16" weight="regular" aria-hidden="true" />
            {{ batchUploadPending ? 'Uploading…' : 'Upload ZIP' }}
          </button>
        </template>
      </UiMenu>
    </div>
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
              <CertsJobProgress :job="certJob" :show-cert="false" compact />
              <span v-if="!certJob.taskTotal && !certJob.requestIndex">Working…</span>
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
          <p v-if="entry.rateLimitedUntil && Date.parse(entry.rateLimitedUntil) > nowMs" class="mt-0.5 text-xs text-danger">
            Rate limited · {{ formatRemaining(entry.rateLimitedUntil, nowMs) }} left
            <span class="text-muted"> (until {{ formatTime(entry.rateLimitedUntil) }})</span>
          </p>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <UiButton
            v-if="canIssueCert(entry)"
            size="sm"
            title="Queue Let's Encrypt issue / renew for this apex only"
            :disabled="isIssueDisabled(entry)"
            @click="emit('issue', entry.certName, false)"
          >
            <Lightning :size="14" weight="regular" aria-hidden="true" />
            {{ issuingCerts.includes(entry.certName) ? 'Queuing…' : (isCertInFlightOrQueued(entry.certName) ? 'Queued' : 'Issue') }}
          </UiButton>
          <UiMenu
            v-if="showActionsMenu(entry)"
            :open="actionsMenuOpen === entry.certName"
            align="right"
            @update:open="setActionsMenuOpen(entry.certName, $event)"
          >
            <template #trigger="{ open, toggle, panelId }">
              <button
                type="button"
                class="inline-flex rounded-[6px] p-2 text-muted transition-colors hover:bg-paper hover:text-ink"
                :class="open && 'bg-paper text-ink'"
                :aria-expanded="open"
                aria-haspopup="menu"
                :aria-controls="panelId"
                :aria-label="`Actions for ${entry.certName}`"
                title="Actions"
                :disabled="pending || certJob.running"
                @click="toggle()"
              >
                <Actions :size="16" weight="regular" aria-hidden="true" />
              </button>
            </template>
            <template #default="{ close }">
              <button
                v-if="entry.liveOnDisk"
                type="button"
                role="menuitem"
                class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink hover:bg-paper disabled:opacity-50"
                :disabled="downloadPending === entry.certName"
                @click="close(); emit('download', entry.certName)"
              >
                <Download :size="16" weight="regular" aria-hidden="true" />
                {{ downloadPending === entry.certName ? 'Downloading…' : 'Download' }}
              </button>
              <button
                v-if="entry.inDomainsFile"
                type="button"
                role="menuitem"
                class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink hover:bg-paper disabled:opacity-50"
                :disabled="uploadPending === entry.certName"
                @click="close(); emit('upload', entry.certName)"
              >
                <Upload :size="16" weight="regular" aria-hidden="true" />
                {{ uploadPending === entry.certName ? 'Uploading…' : 'Upload' }}
              </button>
              <button
                v-if="canIssueCert(entry)"
                type="button"
                role="menuitem"
                class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink hover:bg-paper disabled:opacity-50"
                :disabled="isIssueDisabled(entry)"
                @click="close(); emit('issue', entry.certName, true)"
              >
                <Lightning :size="16" weight="regular" aria-hidden="true" />
                Force Issue
              </button>
              <button
                v-if="entry.tree !== 'none'"
                type="button"
                role="menuitem"
                class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-danger hover:bg-paper"
                @click="close(); emit('trash-request', entry.certName)"
              >
                <Trash :size="16" weight="regular" aria-hidden="true" />
                Delete
              </button>
            </template>
          </UiMenu>
        </div>
      </li>
    </ul>
  </UiPanel>
</template>
