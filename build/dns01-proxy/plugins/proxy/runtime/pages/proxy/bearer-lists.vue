<script setup lang="ts">
import type {
  BearerGeneratedToken,
  BearerListInput,
  BearerListPublic,
} from '#proxy-shared/types/bearerKey'
import {
  PhArrowsClockwise as ArrowsClockwise,
  PhPlus as Plus,
} from '@phosphor-icons/vue'

useHead({ title: 'Bearer Lists · Proxy' })

const toasts = useToasts()
const {
  lists,
  pending,
  error,
  loadLists,
  saveList,
  removeList,
} = useBearerLists()

const modalOpen = ref(false)
const saving = ref(false)
const deleteOpen = ref(false)
const deleteTarget = ref<BearerListPublic | null>(null)
const revealed = ref<BearerGeneratedToken[]>([])
const modalRef = useTemplateRef<{ load: (list?: BearerListPublic | null) => void }>('modal')

async function refresh() {
  try {
    await loadLists()
  }
  catch {
    toasts.error(error.value || 'Failed to load bearer lists', 'Proxy')
  }
}

function openCreate() {
  revealed.value = []
  modalOpen.value = true
  nextTick(() => {
    modalRef.value?.load(null)
  })
}

function openEdit(list: BearerListPublic) {
  revealed.value = []
  modalOpen.value = true
  nextTick(() => {
    modalRef.value?.load(list)
  })
}

async function onSave(input: BearerListInput) {
  saving.value = true
  try {
    const result = await saveList(input)
    modalOpen.value = false
    revealed.value = result.generatedTokens
    toasts.ok(input.id ? 'Bearer list updated' : 'Bearer list created', 'Proxy')
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed'
    toasts.error(message, 'Proxy')
  }
  finally {
    saving.value = false
  }
}

function askDelete(list: BearerListPublic) {
  deleteTarget.value = list
  deleteOpen.value = true
}

async function confirmDelete() {
  const list = deleteTarget.value
  if (!list) {
    return
  }
  try {
    await removeList(list.id)
    revealed.value = revealed.value.filter(item =>
      list.keys.every(key => key.id !== item.keyId),
    )
    toasts.ok(`Removed ${list.name}`, 'Proxy')
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

async function copyToken(token: string) {
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
          Bearer Lists
        </h2>
        <p class="max-w-[65ch] text-sm text-muted">
          Named groups of inbound gateway tokens. Bind a list on a Proxy Host so clients must send
          <span class="font-mono">Authorization: Bearer …</span>
          matching any key in the list. Without auth,
          <span class="font-mono">GET /</span> only shows upstream live status.
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
          Add Bearer List
        </UiButton>
      </div>
    </div>

    <div
      v-if="revealed.length"
      class="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-signal/40 bg-panel p-4"
      role="status"
    >
      <p class="text-sm font-medium text-ink">
        Copy {{ revealed.length === 1 ? 'this token' : 'these tokens' }} now — auto-generated values are not shown again.
      </p>
      <div
        v-for="(item, index) in revealed"
        :key="item.keyId"
        class="flex flex-col gap-2"
      >
        <p
          v-if="revealed.length > 1"
          class="text-xs text-muted"
        >
          Key {{ index + 1 }}
        </p>
        <code class="break-all rounded border border-rule bg-paper px-3 py-2 font-mono text-xs text-ink">
          {{ item.token }}
        </code>
        <UiButton
          size="sm"
          class="self-start"
          @click="copyToken(item.token)"
        >
          Copy token
        </UiButton>
      </div>
      <UiButton
        variant="ghost"
        size="sm"
        class="self-start"
        @click="revealed = []"
      >
        Dismiss
      </UiButton>
    </div>

    <div
      v-if="!pending && !lists.length"
      class="border border-dashed border-rule bg-panel px-5 py-10"
      style="border-radius: var(--radius-panel)"
    >
      <h2 class="text-xl font-semibold tracking-tight">
        No bearer lists yet
      </h2>
      <p class="mt-2 max-w-[65ch] text-muted">
        Create a list with one or more keys (custom or auto-generated), then select it on a Proxy Host.
      </p>
      <UiButton
        class="mt-6"
        @click="openCreate"
      >
        Add Bearer List
      </UiButton>
    </div>

    <ProxyBearerListTable
      v-else
      :lists
      @edit="openEdit"
      @remove="askDelete"
    />

    <ProxyBearerListModal
      ref="modal"
      v-model:open="modalOpen"
      :saving
      @save="onSave"
    />

    <UiConfirmDialog
      v-model:open="deleteOpen"
      title="Delete bearer list?"
      confirm-label="Delete"
      danger
      @confirm="confirmDelete"
    >
      <p class="text-sm text-muted">
        Remove
        <span class="font-mono text-ink">{{ deleteTarget?.name }}</span>
        and all of its keys.
        Hosts still using this list will block the delete.
      </p>
    </UiConfirmDialog>
  </div>
</template>
