<script setup lang="ts">
import type {
  CertJobQueueSnapshot,
  CertJobStatus,
  CertStatusEntry,
  LetsEncryptDirectoryMode,
} from '#shared/types/certs'
import {
  canIssueCert,
  certInFlightOrQueued,
  formatRemaining,
  formatTime,
  issueDisabled,
  statusLabel,
} from '#shared/utils/certsUi'
import { PhDotsThreeVertical as Actions, PhDownload as Download, PhLightning as Lightning, PhTrash as Trash, PhUpload as Upload } from '@phosphor-icons/vue'

const {
  directoryMode,
  acmeEnabled,
  pending,
  dirty,
  statusEntries,
  certJob,
  certQueue,
  issuingCerts,
  downloadPending,
  uploadPending,
  batchDownloadPending = false,
  batchUploadPending = false,
  actionsMenuOpen,
  nowMs,
} = defineProps<{
  directoryMode: LetsEncryptDirectoryMode
  acmeEnabled: boolean
  pending: boolean
  dirty: boolean
  statusEntries: CertStatusEntry[]
  certJob: CertJobStatus
  certQueue: CertJobQueueSnapshot
  issuingCerts: string[]
  downloadPending: string | null
  uploadPending: string | null
  batchDownloadPending?: boolean
  batchUploadPending?: boolean
  actionsMenuOpen: string | null
  nowMs: number
}>()

const emit = defineEmits<{
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
</script>

<template>
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
              <span v-if="!certJob.taskTotal && !certJob.tasks?.length">Working…</span>
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
