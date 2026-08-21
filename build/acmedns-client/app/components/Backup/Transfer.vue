<script setup lang="ts">
import { PhDownload as Download, PhUpload as Upload } from '@phosphor-icons/vue'
import type { ClientStorageMap } from '#shared/types/clientstorage'

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

const { storagePath = '', pending = false } = defineProps<{
  storagePath?: string
  pending?: boolean
}>()

const emit = defineEmits<{
  busy: [value: boolean]
  restored: []
}>()

const { entries, downloadFile, uploadFile } = useClientStorage()
const toasts = useToasts()
const fileInput = useTemplateRef<HTMLInputElement>('file-input')
const pendingFile = ref<ClientStorageMap | null>(null)
const confirmOpen = ref(false)
const liveHostCount = computed(() => entries.value.length)

function looksLikeDomainBackup(value: unknown) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as { kind?: unknown }).kind === 'domain',
  )
}

function looksLikeStorageMap(value: unknown): value is ClientStorageMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  return Object.values(value as Record<string, unknown>).every((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return false
    }
    const record = item as Record<string, unknown>
    return typeof record.fulldomain === 'string'
      && typeof record.subdomain === 'string'
      && typeof record.username === 'string'
      && typeof record.password === 'string'
      && typeof record.server_url === 'string'
  })
}

async function downloadLive() {
  emit('busy', true)
  try {
    await downloadFile()
    toasts.ok('clientstorage.json downloaded')
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Download failed')
  }
  finally {
    emit('busy', false)
  }
}

function openPicker() {
  fileInput.value?.click()
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) {
    return
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    toasts.error('File is larger than 2 MiB')
    return
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  }
  catch {
    toasts.error('File is not valid JSON')
    return
  }

  if (looksLikeDomainBackup(parsed)) {
    toasts.error('That file is a hostname backup. Restore it from the list below.')
    return
  }

  if (!looksLikeStorageMap(parsed)) {
    toasts.error('File does not look like clientstorage.json')
    return
  }

  pendingFile.value = parsed
  if (liveHostCount.value > 0) {
    confirmOpen.value = true
    return
  }

  await confirmUpload()
}

async function confirmUpload() {
  const storage = pendingFile.value
  pendingFile.value = null
  if (!storage) {
    return
  }

  emit('busy', true)
  try {
    const result = await uploadFile(storage, true)
    emit('restored')
    toasts.ok(result.message)
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Upload failed')
  }
  finally {
    emit('busy', false)
  }
}

function cancelUpload() {
  pendingFile.value = null
}
</script>

<template>
  <UiPanel class="flex flex-col gap-3">
    <h2 class="text-base font-semibold">Live file</h2>
    <p class="text-sm text-muted">
      Download or replace the live <span class="font-mono text-ink">CLIENTSTORAGE_DATA</span> file.
      Upload overwrites every stored hostname after you confirm.
    </p>
    <p v-if="storagePath" class="font-mono text-xs text-muted">
      {{ storagePath }}
    </p>
    <div class="mt-auto flex flex-wrap gap-2">
      <UiButton :disabled="pending" @click="downloadLive">
        <Download :size="16" weight="regular" aria-hidden="true" />
        Download clientstorage.json
      </UiButton>
      <UiButton variant="ghost" :disabled="pending" @click="openPicker">
        <Upload :size="16" weight="regular" aria-hidden="true" />
        Upload clientstorage.json
      </UiButton>
      <input
        ref="file-input"
        type="file"
        accept="application/json,.json"
        class="sr-only"
        aria-label="Upload clientstorage.json"
        @change="onFileChange"
      >
    </div>

    <UiConfirmDialog
      v-model:open="confirmOpen"
      title="Replace live storage?"
      confirm-label="Replace"
      cancel-label="Keep live"
      danger
      @confirm="confirmUpload"
      @cancel="cancelUpload"
    >
      This overwrites the live clientstorage.json, including every stored hostname.
    </UiConfirmDialog>
  </UiPanel>
</template>
