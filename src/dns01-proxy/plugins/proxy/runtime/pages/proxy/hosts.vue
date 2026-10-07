<script setup lang="ts">
import type { ProxyHost, ProxyHostInput } from '#proxy-shared/types/proxyHost'
import {
  buildProxyHostImportRows,
  looksLikeProxyHostsFile,
  resolveProxyHostImportTargetId,
  type ProxyHostImportRow,
} from '#proxy-shared/utils/proxyHost'
import { triggerDownload } from '#client/utils/download'
import {
  PhArrowsClockwise as ArrowsClockwise,
  PhDownload as Download,
  PhGear as Gear,
  PhPlus as Plus,
  PhUpload as Upload,
} from '@phosphor-icons/vue'

useHead({ title: 'Hosts · Proxy' })

const MAX_IMPORT_BYTES = 2 * 1024 * 1024

const toasts = useToasts()
const {
  hosts,
  certEntries,
  healthById,
  remoteHealthById,
  pending,
  error,
  loadHosts,
  loadCertNames,
  loadAllHealth,
  loadAllRemoteHealth,
  saveHost,
  removeHost,
} = useProxyHosts()

const { flashes: visitFlashes } = useProxyVisitStream()

const { lists: accessLists, loadLists: loadAccessLists } = useAccessLists()
const { lists: bearerLists, loadLists: loadBearerLists } = useBearerLists()

const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const togglingId = ref<string | null>(null)
const deleteOpen = ref(false)
const deleteTarget = ref<ProxyHost | null>(null)
const modalRef = useTemplateRef<{ load: (host?: ProxyHost | null) => void }>('modal')

const transferMenuOpen = ref(false)
const importFileInput = useTemplateRef<HTMLInputElement>('import-file')
const importOpen = ref(false)
const importRows = ref<ProxyHostImportRow[]>([])
const importing = ref(false)

async function refresh() {
  try {
    await Promise.all([loadHosts(), loadCertNames(), loadAccessLists(), loadBearerLists()])
    await Promise.all([loadAllHealth(), loadAllRemoteHealth()])
  }
  catch {
    toasts.error(error.value || 'Failed to load proxy hosts', 'Proxy')
  }
}

function openCreate() {
  editingId.value = null
  modalOpen.value = true
  nextTick(() => {
    modalRef.value?.load(null)
  })
}

function openEdit(host: ProxyHost) {
  editingId.value = host.id
  modalOpen.value = true
  nextTick(() => {
    modalRef.value?.load(host)
  })
}

async function onSave(input: ProxyHostInput) {
  saving.value = true
  try {
    const payload: ProxyHostInput = {
      ...input,
      ...(editingId.value ? { id: editingId.value } : {}),
    }
    await saveHost(payload)
    modalOpen.value = false
    editingId.value = null
    toasts.ok(payload.id ? 'Proxy host updated' : 'Proxy host created', 'Proxy')
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed'
    toasts.error(message, 'Proxy')
  }
  finally {
    saving.value = false
  }
}

function askDelete(host: ProxyHost) {
  deleteTarget.value = host
  deleteOpen.value = true
}

async function confirmDelete() {
  const host = deleteTarget.value
  if (!host) {
    return
  }
  try {
    await removeHost(host.id)
    toasts.ok(`Removed ${host.domainNames[0] || host.id}`, 'Proxy')
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed'
    toasts.error(message, 'Proxy')
  }
  finally {
    deleteOpen.value = false
    deleteTarget.value = null
  }
}

async function onToggleEnabled(host: ProxyHost, enabled: boolean) {
  togglingId.value = host.id
  try {
    await saveHost({ ...host, enabled })
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed'
    toasts.error(message, 'Proxy')
  }
  finally {
    togglingId.value = null
  }
}

function exportHosts() {
  const payload = {
    version: 1 as const,
    hosts: hosts.value,
  }
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: 'application/json',
  })
  triggerDownload(blob, 'proxy-hosts.json')
  toasts.ok(`Exported ${hosts.value.length} host${hosts.value.length === 1 ? '' : 's'}`, 'Proxy')
}

function openImportPicker() {
  importFileInput.value?.click()
}

async function onImportFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) {
    return
  }

  if (file.size > MAX_IMPORT_BYTES) {
    toasts.error('File is larger than 2 MiB', 'Proxy')
    return
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  }
  catch {
    toasts.error('File is not valid JSON', 'Proxy')
    return
  }

  if (!looksLikeProxyHostsFile(parsed)) {
    toasts.error('File does not look like proxy-hosts.json', 'Proxy')
    return
  }

  importRows.value = buildProxyHostImportRows(parsed, hosts.value)
  if (!importRows.value.length) {
    toasts.error('No proxy hosts found in this file', 'Proxy')
    return
  }
  importOpen.value = true
}

async function confirmImport(keys: string[]) {
  const selected = new Set(keys)
  const rows = importRows.value.filter(row => selected.has(row.key))
  if (!rows.length) {
    return
  }

  importing.value = true
  let created = 0
  let replaced = 0
  let failed = 0

  try {
    for (const row of rows) {
      const targetId = resolveProxyHostImportTargetId(row)
      if (targetId === undefined) {
        failed += 1
        toasts.error(
          `Skipped ${row.host.domainNames[0] || row.host.id}: source domains span multiple hosts`,
          'Proxy',
        )
        continue
      }
      try {
        const fields = { ...row.host }
        delete (fields as { id?: string }).id
        const payload: ProxyHostInput = targetId
          ? { ...fields, id: targetId }
          : fields
        await saveHost(payload)
        if (targetId) {
          replaced += 1
        }
        else {
          created += 1
        }
      }
      catch (err) {
        failed += 1
        const message = err instanceof Error ? err.message : 'Import failed'
        toasts.error(message, 'Proxy')
      }
    }

    importOpen.value = false
    importRows.value = []
    await Promise.all([loadAllHealth(), loadAllRemoteHealth()])

    const parts = [
      created ? `${created} imported` : '',
      replaced ? `${replaced} replaced` : '',
      failed ? `${failed} failed` : '',
    ].filter(Boolean)
    if (created || replaced) {
      toasts.ok(parts.join(', ') || 'Import complete', 'Proxy')
    }
    else if (failed) {
      toasts.error(parts.join(', ') || 'Import failed', 'Proxy')
    }
  }
  finally {
    importing.value = false
  }
}

const HEALTH_REPROBE_MS = 30_000
let healthTimer: ReturnType<typeof setInterval> | undefined

async function reprobeHealth() {
  if (pending.value || !hosts.value.length) {
    return
  }
  try {
    await Promise.all([loadAllHealth(), loadAllRemoteHealth()])
  }
  catch {
    // Interval pass is best-effort; Refresh still surfaces errors.
  }
}

onMounted(() => {
  void refresh()
  healthTimer = setInterval(() => {
    void reprobeHealth()
  }, HEALTH_REPROBE_MS)
})

onUnmounted(() => {
  if (healthTimer) {
    clearInterval(healthTimer)
    healthTimer = undefined
  }
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex flex-col gap-1">
        <h2 class="text-xl font-semibold tracking-tight text-ink">
          Hosts
        </h2>
        <p class="max-w-[65ch] text-sm text-muted">
          Domain → forward target. Live on edge ports 80/443.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UiMenu v-model:open="transferMenuOpen" align="right">
          <template #trigger="{ open, toggle, panelId }">
            <button
              type="button"
              class="inline-flex items-center justify-center rounded-[6px] border border-rule p-1.5 text-muted transition-colors hover:bg-paper hover:text-ink"
              :class="open && 'bg-paper text-ink'"
              :aria-expanded="open"
              aria-haspopup="menu"
              :aria-controls="panelId"
              aria-label="Import or export proxy hosts"
              title="Import / export"
              :disabled="pending || importing"
              @click="toggle()"
            >
              <Gear :size="16" weight="regular" aria-hidden="true" />
            </button>
          </template>
          <template #default="{ close }">
            <button
              type="button"
              role="menuitem"
              class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink hover:bg-paper disabled:opacity-50"
              :disabled="pending || importing || !hosts.length"
              @click="close(); exportHosts()"
            >
              <Download :size="16" weight="regular" aria-hidden="true" />
              Export JSON
            </button>
            <button
              type="button"
              role="menuitem"
              class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink hover:bg-paper disabled:opacity-50"
              :disabled="pending || importing"
              @click="close(); openImportPicker()"
            >
              <Upload :size="16" weight="regular" aria-hidden="true" />
              Import JSON
            </button>
          </template>
        </UiMenu>
        <input
          ref="import-file"
          type="file"
          accept="application/json,.json"
          class="sr-only"
          aria-label="Import proxy-hosts.json"
          @change="onImportFileChange"
        >
        <UiButton
          variant="ghost"
          size="sm"
          :disabled="pending"
          @click="refresh"
        >
          <ArrowsClockwise
            :size="14"
            weight="bold"
            :class="pending && 'animate-spin'"
            aria-hidden="true"
          />
          Refresh
        </UiButton>
        <UiButton
          size="sm"
          @click="openCreate"
        >
          <Plus
            :size="14"
            weight="bold"
            aria-hidden="true"
          />
          Add Proxy Host
        </UiButton>
      </div>
    </div>

    <div
      v-if="!pending && !hosts.length"
      class="border border-dashed border-rule bg-panel px-5 py-10"
      style="border-radius: var(--radius-panel)"
    >
      <h2 class="text-xl font-semibold tracking-tight">
        No proxy hosts yet
      </h2>
      <p class="mt-2 max-w-[65ch] text-muted">
        Add a domain → forward target. Live on edge ports 80/443. Certificates come from the Certificates page.
      </p>
      <UiButton
        class="mt-6"
        @click="openCreate"
      >
        Add Proxy Host
      </UiButton>
    </div>

    <ProxyHostTable
      v-else
      :hosts
      :health-by-id="healthById"
      :remote-health-by-id="remoteHealthById"
      :cert-entries="certEntries"
      :toggling-id="togglingId"
      :visit-flashes="visitFlashes"
      @edit="openEdit"
      @remove="askDelete"
      @toggle-enabled="onToggleEnabled"
    />

    <ProxyHostModal
      ref="modal"
      v-model:open="modalOpen"
      :cert-entries="certEntries"
      :existing-hosts="hosts"
      :access-lists="accessLists"
      :bearer-lists="bearerLists"
      :saving
      @save="onSave"
    />

    <ProxyHostsImportModal
      v-model:open="importOpen"
      :rows="importRows"
      :pending="importing"
      @confirm="confirmImport"
      @cancel="importRows = []"
    />

    <UiConfirmDialog
      v-model:open="deleteOpen"
      title="Delete proxy host?"
      confirm-label="Delete"
      danger
      @confirm="confirmDelete"
    >
      <p class="text-sm text-muted">
        Remove
        <span class="font-mono text-ink">{{ deleteTarget?.domainNames.join(', ') }}</span>
        from the live Bun reverse proxy.
      </p>
    </UiConfirmDialog>
  </div>
</template>
