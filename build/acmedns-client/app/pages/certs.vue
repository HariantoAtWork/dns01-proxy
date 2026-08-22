<script setup lang="ts">
import type { LetsEncryptDirectoryMode } from '#shared/types/certs'
import { PhCertificate as Certificate, PhTrash as Trash } from '@phosphor-icons/vue'

useHead({ title: 'Certificates' })

const toasts = useToasts()
const {
  text,
  parsed,
  statusEntries,
  directoryMode,
  acmeEnabled,
  applyResults,
  error,
  pending,
  loadDomains,
  loadSettings,
  saveSettings,
  saveDomains,
  loadStatus,
  apply,
  trashCert,
} = useCerts()

const dirty = ref(false)
const loaded = ref(false)

onMounted(async () => {
  try {
    await Promise.all([loadDomains(), loadSettings()])
    await loadStatus()
    loaded.value = true
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Failed to load certificates')
  }
})

watch(text, () => {
  if (loaded.value) {
    dirty.value = true
  }
})

async function onSave() {
  try {
    const result = await saveDomains()
    if (result.ok) {
      dirty.value = false
      toasts.ok('domains.txt saved')
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
    const failed = data.results.filter(r => !r.ok)
    if (failed.length) {
      toasts.error(failed.map(r => `${r.certName}: ${r.message}`).join('; '))
    }
    else {
      toasts.ok(`Apply finished (${data.mode})`)
    }
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
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UiButton to="/certs/trash" variant="ghost" size="sm">
          <Trash :size="14" weight="regular" aria-hidden="true" />
          Trash
        </UiButton>
      </div>
    </div>

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

      <p v-if="dirty" class="mt-2 text-xs text-muted">
        Unsaved changes — Save before Apply.
      </p>
      <pre v-if="error" class="mt-2 whitespace-pre-wrap text-xs text-danger">{{ error }}</pre>
    </UiPanel>

    <UiPanel v-if="parsed?.lines?.length">
      <h2 class="text-sm font-semibold text-ink">Parsed lines</h2>
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
        </li>
      </ul>
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
            </p>
            <p v-if="entry.notAfter" class="mt-0.5 text-xs text-muted">
              Expires {{ new Date(entry.notAfter).toLocaleString() }}
            </p>
            <p v-if="entry.sansOnDisk?.length" class="mt-0.5 font-mono text-[11px] text-muted">
              On disk: {{ entry.sansOnDisk.join(', ') }}
            </p>
          </div>
          <UiButton
            v-if="entry.tree !== 'none'"
            variant="ghost"
            size="sm"
            :disabled="pending"
            @click="onTrash(entry.certName)"
          >
            Trash
          </UiButton>
        </li>
      </ul>
    </UiPanel>

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
