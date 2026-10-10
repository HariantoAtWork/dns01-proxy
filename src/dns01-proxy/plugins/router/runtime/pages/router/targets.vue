<script setup lang="ts">
import type { RouterTarget, RouterTargetInput } from '#router-shared/types/routerTarget'
import {
  PhArrowsClockwise as ArrowsClockwise,
  PhPlus as Plus,
} from '@phosphor-icons/vue'

useHead({ title: 'Targets · Router' })

const toasts = useToasts()
const {
  targets,
  pending,
  error,
  loadTargets,
  saveTarget,
  removeTarget,
} = useRouterTargets()

const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const togglingId = ref<string | null>(null)
const deleteOpen = ref(false)
const deleteTarget = ref<RouterTarget | null>(null)
const modalRef = useTemplateRef<{ load: (target?: RouterTarget | null) => void }>('modal')

async function refresh() {
  try {
    await loadTargets()
  }
  catch {
    toasts.error(error.value || 'Failed to load targets', 'Router')
  }
}

function openCreate() {
  editingId.value = null
  modalOpen.value = true
  nextTick(() => {
    modalRef.value?.load(null)
  })
}

function openEdit(target: RouterTarget) {
  editingId.value = target.id
  modalOpen.value = true
  nextTick(() => {
    modalRef.value?.load(target)
  })
}

function apiErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'data' in err) {
    const statusMessage = (err as { data?: { statusMessage?: string } }).data?.statusMessage
    if (statusMessage) {
      return statusMessage
    }
  }
  return err instanceof Error ? err.message : fallback
}

async function onSave(input: RouterTargetInput) {
  saving.value = true
  try {
    const payload: RouterTargetInput = {
      ...input,
      ...(editingId.value ? { id: editingId.value } : {}),
    }
    await saveTarget(payload)
    modalOpen.value = false
    editingId.value = null
    toasts.ok(payload.id ? 'Target updated' : 'Target created', 'Router')
  }
  catch (err) {
    toasts.error(apiErrorMessage(err, 'Save failed'), 'Router')
  }
  finally {
    saving.value = false
  }
}

function askDelete(target: RouterTarget) {
  deleteTarget.value = target
  deleteOpen.value = true
}

async function confirmDelete() {
  const target = deleteTarget.value
  if (!target) {
    return
  }
  try {
    await removeTarget(target.id)
    toasts.ok(`Removed ${target.name}`, 'Router')
  }
  catch (err) {
    toasts.error(apiErrorMessage(err, 'Delete failed'), 'Router')
  }
  finally {
    deleteOpen.value = false
    deleteTarget.value = null
  }
}

async function onToggleEnabled(target: RouterTarget, enabled: boolean) {
  togglingId.value = target.id
  try {
    await saveTarget({ ...target, enabled })
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed'
    toasts.error(message, 'Router')
  }
  finally {
    togglingId.value = null
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
          Targets
        </h2>
        <p class="max-w-[65ch] text-sm text-muted">
          Named machines that receive forwarded TCP/UDP traffic (host or IP).
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UiButton
          variant="ghost"
          :disabled="pending"
          @click="refresh"
        >
          <ArrowsClockwise :size="16" />
          Refresh
        </UiButton>
        <UiButton @click="openCreate">
          <Plus :size="16" />
          Add target
        </UiButton>
      </div>
    </div>

    <div
      v-if="!pending && !targets.length"
      class="rounded-[var(--radius-panel)] border border-dashed border-rule bg-panel px-5 py-10"
    >
      <h3 class="text-lg font-semibold text-ink">
        No targets yet
      </h3>
      <p class="mt-2 max-w-[65ch] text-sm text-muted">
        Add a machine (e.g. sunshine → 192.168.1.50), then attach sources.
      </p>
      <UiButton
        class="mt-6"
        @click="openCreate"
      >
        <Plus :size="16" />
        Add target
      </UiButton>
    </div>

    <RouterTargetTable
      v-else-if="targets.length"
      :targets="targets"
      :toggling-id="togglingId"
      @edit="openEdit"
      @remove="askDelete"
      @toggle-enabled="onToggleEnabled"
    />

    <RouterTargetModal
      ref="modal"
      v-model:open="modalOpen"
      :saving="saving"
      @save="onSave"
    />

    <UiConfirmDialog
      v-model:open="deleteOpen"
      title="Delete target?"
      confirm-label="Delete"
      danger
      @confirm="confirmDelete"
    >
      <p class="text-sm text-muted">
        Remove
        <span class="font-mono text-ink">{{ deleteTarget?.name }}</span>?
        Sources using it must be deleted first.
      </p>
    </UiConfirmDialog>
  </div>
</template>
