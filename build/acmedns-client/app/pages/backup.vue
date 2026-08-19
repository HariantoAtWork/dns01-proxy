<script setup lang="ts">
import type { BackupListItem } from '#shared/types/backup'

useHead({ title: 'Backup' })

const route = useRoute()
const { entries, refresh: refreshStorage } = useClientStorage()
const { items, directory, storagePath, error, status, refresh, createBackup, restoreBackup, deleteBackup } = useBackups()
const toasts = useToasts()

const domains = computed(() => entries.value.map(entry => entry.domain))
const selectedDomain = ref('')
const pending = ref(false)
const busyFile = ref('')

const restoreTarget = ref<BackupListItem | null>(null)
const deleteTarget = ref<BackupListItem | null>(null)
const restoreOpen = ref(false)
const deleteOpen = ref(false)

watch([domains, () => route.query.domain], () => {
  const query = route.query.domain
  const wanted = typeof query === 'string' ? query : ''
  if (wanted && domains.value.includes(wanted)) {
    selectedDomain.value = wanted
    return
  }
  if (!selectedDomain.value || !domains.value.includes(selectedDomain.value)) {
    selectedDomain.value = domains.value[0] ?? ''
  }
}, { immediate: true })

async function run(action: () => Promise<unknown>, ok: string) {
  pending.value = true
  try {
    await action()
    toasts.ok(ok)
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Backup request failed')
  }
  finally {
    pending.value = false
  }
}

function backupFull() {
  void run(() => createBackup({ kind: 'full' }), 'Full backup written')
}

function backupDomain() {
  if (!selectedDomain.value) {
    return
  }
  void run(
    () => createBackup({ kind: 'domain', domain: selectedDomain.value }),
    `Backup written for ${selectedDomain.value}`,
  )
}

function askRestore(item: BackupListItem) {
  restoreTarget.value = item
  restoreOpen.value = true
}

function askDelete(item: BackupListItem) {
  deleteTarget.value = item
  deleteOpen.value = true
}

const restoreTitle = computed(() => {
  const item = restoreTarget.value
  if (!item) {
    return 'Restore backup?'
  }
  return item.kind === 'full' ? 'Replace live storage?' : 'Merge this hostname?'
})

const restoreLabel = computed(() => {
  const item = restoreTarget.value
  if (!item) {
    return ''
  }
  if (item.kind === 'full') {
    return 'This overwrites the live clientstorage.json, including every stored hostname.'
  }
  if (item.domain && domains.value.includes(item.domain)) {
    return `${item.domain} already exists. Restore will overwrite that credentials object.`
  }
  if (item.domain) {
    return `${item.domain} is not in live storage. Restore will add it.`
  }
  return 'Restore will merge this hostname into live storage.'
})

async function confirmRestore() {
  const item = restoreTarget.value
  if (!item) {
    return
  }
  busyFile.value = item.filename
  try {
    const result = await restoreBackup(item.filename, true)
    await refreshStorage()
    toasts.ok(result.message)
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Restore failed')
  }
  finally {
    busyFile.value = ''
    restoreTarget.value = null
  }
}

async function confirmDelete() {
  const item = deleteTarget.value
  if (!item) {
    return
  }
  busyFile.value = item.filename
  try {
    await deleteBackup(item.filename)
    toasts.ok('Backup file deleted')
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Delete failed')
  }
  finally {
    busyFile.value = ''
    deleteTarget.value = null
  }
}
</script>

<template>
  <div class="flex flex-col gap-8">
    <header class="flex flex-col gap-2">
      <h1 class="text-2xl font-semibold tracking-tight">Backup / Restore</h1>
      <p class="max-w-[65ch] text-muted">
        Operator copies of <span class="font-mono text-ink">clientstorage.json</span>.
        Full dumps replace the live file. Domain dumps merge one hostname.
        You can also download or upload the live <span class="font-mono text-ink">CLIENTSTORAGE_DATA</span> file.
        Server copies sit under <span class="font-mono text-ink">acmedns-client/backups</span>
        inside the data root.
      </p>
      <p v-if="directory" class="font-mono text-xs text-muted">
        {{ directory }}
      </p>
    </header>

    <BackupActions
      v-model:domain="selectedDomain"
      :domains
      :pending
      @full="backupFull"
      @domain="backupDomain"
    />

    <BackupTransfer
      :storage-path="storagePath"
      :pending
      @busy="pending = $event"
      @restored="refreshStorage"
    />

    <section class="flex flex-col gap-3">
      <h2 class="text-base font-semibold">Existing backups</h2>

      <div v-if="status === 'pending'" class="h-40 animate-pulse bg-panel" style="border-radius: var(--radius-panel)" />

      <div
        v-else-if="error"
        class="border border-danger bg-panel p-4"
        style="border-radius: var(--radius-panel)"
      >
        <p class="font-medium">Could not list backups</p>
        <p class="mt-1 text-sm text-muted">{{ error.message || 'The backup folder could not be read.' }}</p>
        <button
          type="button"
          class="mt-3 rounded-[6px] bg-signal px-3 py-2 text-sm text-signal-ink"
          @click="refresh()"
        >
          Retry
        </button>
      </div>

      <div
        v-else-if="!items.length"
        class="border border-dashed border-rule bg-panel px-5 py-10"
        style="border-radius: var(--radius-panel)"
      >
        <h3 class="text-lg font-semibold tracking-tight">No backup files yet</h3>
        <p class="mt-2 max-w-[65ch] text-muted">
          Take a full dump or a single hostname backup. The folder is created on first write.
        </p>
      </div>

      <BackupList
        v-else
        :items
        :live-domains="domains"
        :busy-file="busyFile"
        @restore="askRestore"
        @remove="askDelete"
      />
    </section>

    <UiConfirmDialog
      v-model:open="restoreOpen"
      :title="restoreTitle"
      confirm-label="Restore"
      cancel-label="Keep live"
      danger
      @confirm="confirmRestore"
    >
      {{ restoreLabel }}
    </UiConfirmDialog>

    <UiConfirmDialog
      v-model:open="deleteOpen"
      title="Delete this backup file?"
      confirm-label="Delete"
      cancel-label="Keep"
      danger
      @confirm="confirmDelete"
    >
      Only the copy in the backup folder is removed. Live clientstorage.json is not changed.
    </UiConfirmDialog>
  </div>
</template>
