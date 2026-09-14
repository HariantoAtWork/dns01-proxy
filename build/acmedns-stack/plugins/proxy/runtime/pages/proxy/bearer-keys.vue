<script setup lang="ts">
import type { BearerKeyCreated, BearerKeyInput, BearerKeyPublic } from '#proxy-shared/types/bearerKey'
import {
  PhArrowsClockwise as ArrowsClockwise,
  PhPlus as Plus,
} from '@phosphor-icons/vue'

useHead({ title: 'Bearer Keys · Proxy' })

const toasts = useToasts()
const {
  keys,
  pending,
  error,
  loadKeys,
  createKey,
  updateKey,
  rotateKey,
  removeKey,
} = useBearerKeys()

const modalOpen = ref(false)
const saving = ref(false)
const deleteOpen = ref(false)
const deleteTarget = ref<BearerKeyPublic | null>(null)
const rotateOpen = ref(false)
const rotateTarget = ref<BearerKeyPublic | null>(null)
const rotating = ref(false)
const revealed = ref<BearerKeyCreated | null>(null)
const modalRef = useTemplateRef<{ load: (key?: BearerKeyPublic | null) => void }>('modal')

async function refresh() {
  try {
    await loadKeys()
  }
  catch {
    toasts.error(error.value || 'Failed to load bearer keys', 'Proxy')
  }
}

function openCreate() {
  revealed.value = null
  modalOpen.value = true
  nextTick(() => {
    modalRef.value?.load(null)
  })
}

function openEdit(key: BearerKeyPublic) {
  revealed.value = null
  modalOpen.value = true
  nextTick(() => {
    modalRef.value?.load(key)
  })
}

async function onSave(input: BearerKeyInput) {
  saving.value = true
  try {
    if (input.id) {
      await updateKey({ ...input, id: input.id })
      modalOpen.value = false
      toasts.ok('Bearer key updated', 'Proxy')
    }
    else {
      const created = await createKey(input)
      modalOpen.value = false
      revealed.value = created
      toasts.ok('Bearer key created', 'Proxy')
    }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed'
    toasts.error(message, 'Proxy')
  }
  finally {
    saving.value = false
  }
}

function askDelete(key: BearerKeyPublic) {
  deleteTarget.value = key
  deleteOpen.value = true
}

async function confirmDelete() {
  const key = deleteTarget.value
  if (!key) {
    return
  }
  try {
    await removeKey(key.id)
    if (revealed.value?.id === key.id) {
      revealed.value = null
    }
    toasts.ok(`Removed ${key.name}`, 'Proxy')
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

function askRotate(key: BearerKeyPublic) {
  rotateTarget.value = key
  rotateOpen.value = true
}

async function confirmRotate() {
  const key = rotateTarget.value
  if (!key) {
    return
  }
  rotating.value = true
  try {
    const created = await rotateKey(key.id)
    revealed.value = created
    toasts.ok(`Rotated ${key.name}`, 'Proxy')
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Rotate failed'
    toasts.error(message, 'Proxy')
  }
  finally {
    rotating.value = false
    rotateOpen.value = false
    rotateTarget.value = null
  }
}

async function copyToken() {
  const token = revealed.value?.token
  if (!token) {
    return
  }
  try {
    await navigator.clipboard.writeText(token)
    toasts.ok('Token copied', 'Proxy')
  }
  catch {
    toasts.error('Could not copy token', 'Proxy')
  }
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex flex-col gap-1">
        <h2 class="text-xl font-semibold tracking-tight text-ink">
          Bearer Keys
        </h2>
        <p class="max-w-[65ch] text-sm text-muted">
          Inbound gateway tokens. Bind a key on a Proxy Host so clients must send
          <span class="font-mono">Authorization: Bearer …</span>.
          Without a key, <span class="font-mono">GET /</span> only shows upstream live status.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
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
          Add Bearer Key
        </UiButton>
      </div>
    </div>

    <div
      v-if="revealed"
      class="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-signal/40 bg-panel p-4"
      role="status"
    >
      <p class="text-sm font-medium text-ink">
        Copy this token now — it will not be shown again.
      </p>
      <p class="text-xs text-muted">
        {{ revealed.name }} · {{ revealed.prefix }}
      </p>
      <code class="break-all rounded border border-rule bg-paper px-3 py-2 font-mono text-xs text-ink">
        {{ revealed.token }}
      </code>
      <div class="flex flex-wrap gap-2">
        <UiButton
          size="sm"
          @click="copyToken"
        >
          Copy token
        </UiButton>
        <UiButton
          variant="ghost"
          size="sm"
          @click="revealed = null"
        >
          Dismiss
        </UiButton>
      </div>
    </div>

    <div
      v-if="!pending && !keys.length"
      class="border border-dashed border-rule bg-panel px-5 py-10"
      style="border-radius: var(--radius-panel)"
    >
      <h2 class="text-xl font-semibold tracking-tight">
        No bearer keys yet
      </h2>
      <p class="mt-2 max-w-[65ch] text-muted">
        Create a key, then select it on a Proxy Host to require Bearer auth for proxied paths.
      </p>
      <UiButton
        class="mt-6"
        @click="openCreate"
      >
        Add Bearer Key
      </UiButton>
    </div>

    <ProxyBearerKeyTable
      v-else
      :keys
      @edit="openEdit"
      @rotate="askRotate"
      @remove="askDelete"
    />

    <ProxyBearerKeyModal
      ref="modal"
      v-model:open="modalOpen"
      :saving
      @save="onSave"
    />

    <UiConfirmDialog
      v-model:open="deleteOpen"
      title="Delete bearer key?"
      confirm-label="Delete"
      danger
      @confirm="confirmDelete"
    >
      <p class="text-sm text-muted">
        Remove
        <span class="font-mono text-ink">{{ deleteTarget?.name }}</span>.
        Hosts still using this key will block the delete.
      </p>
    </UiConfirmDialog>

    <UiConfirmDialog
      v-model:open="rotateOpen"
      title="Rotate bearer token?"
      confirm-label="Rotate"
      @confirm="confirmRotate"
    >
      <p class="text-sm text-muted">
        Issue a new token for
        <span class="font-mono text-ink">{{ rotateTarget?.name }}</span>.
        The previous token stops working immediately.
      </p>
    </UiConfirmDialog>
  </div>
</template>
