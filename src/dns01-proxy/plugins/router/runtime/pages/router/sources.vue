<script setup lang="ts">
import type { RouterSource, RouterSourceInput } from '#router-shared/types/routerSource'
import {
  PhArrowsClockwise as ArrowsClockwise,
  PhPlus as Plus,
} from '@phosphor-icons/vue'

useHead({ title: 'Sources · Router' })

const toasts = useToasts()
const {
  targets,
  loadTargets,
} = useRouterTargets()
const {
  sources,
  healthById,
  pending,
  error,
  loadSources,
  loadAllHealth,
  saveSource,
  removeSource,
} = useRouterSources()

const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const togglingId = ref<string | null>(null)
const deleteOpen = ref(false)
const deleteSource = ref<RouterSource | null>(null)
const modalRef = useTemplateRef<{ load: (source?: RouterSource | null) => void }>('modal')

async function refresh() {
  try {
    await Promise.all([loadSources(), loadTargets()])
    await loadAllHealth()
  }
  catch {
    toasts.error(error.value || 'Failed to load sources', 'Router')
  }
}

function openCreate() {
  if (!targets.value.length) {
    toasts.error('Add a target first', 'Router')
    return
  }
  editingId.value = null
  modalOpen.value = true
  nextTick(() => {
    modalRef.value?.load(null)
  })
}

function openEdit(source: RouterSource) {
  editingId.value = source.id
  modalOpen.value = true
  nextTick(() => {
    modalRef.value?.load(source)
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

async function onSave(input: RouterSourceInput) {
  saving.value = true
  try {
    const payload: RouterSourceInput = {
      ...input,
      ...(editingId.value ? { id: editingId.value } : {}),
    }
    await saveSource(payload)
    modalOpen.value = false
    editingId.value = null
    toasts.ok(payload.id ? 'Source updated' : 'Source created', 'Router')
  }
  catch (err) {
    toasts.error(apiErrorMessage(err, 'Save failed'), 'Router')
  }
  finally {
    saving.value = false
  }
}

function askDelete(source: RouterSource) {
  deleteSource.value = source
  deleteOpen.value = true
}

async function confirmDelete() {
  const source = deleteSource.value
  if (!source) {
    return
  }
  try {
    await removeSource(source.id)
    toasts.ok(`Removed ${source.domainNames[0] || source.id}`, 'Router')
  }
  catch (err) {
    toasts.error(apiErrorMessage(err, 'Delete failed'), 'Router')
  }
  finally {
    deleteOpen.value = false
    deleteSource.value = null
  }
}

async function onToggleEnabled(source: RouterSource, enabled: boolean) {
  togglingId.value = source.id
  try {
    await saveSource({ ...source, enabled })
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
          Sources
        </h2>
        <p class="max-w-[65ch] text-sm text-muted">
          Public hostnames that own TCP/UDP port maps to a target. Use the Sunshine / Moonlight preset for gaming.
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
          Add source
        </UiButton>
      </div>
    </div>

    <div
      v-if="!pending && !sources.length"
      class="rounded-[var(--radius-panel)] border border-dashed border-rule bg-panel px-5 py-10"
    >
      <h3 class="text-lg font-semibold text-ink">
        No sources yet
      </h3>
      <p class="mt-2 max-w-[65ch] text-sm text-muted">
        Point a hostname at this box, pick a target, and add port maps (or the Sunshine preset).
      </p>
      <UiButton
        class="mt-6"
        @click="openCreate"
      >
        <Plus :size="16" />
        Add source
      </UiButton>
    </div>

    <RouterSourceTable
      v-else-if="sources.length"
      :sources="sources"
      :targets="targets"
      :health-by-id="healthById"
      :toggling-id="togglingId"
      @edit="openEdit"
      @remove="askDelete"
      @toggle-enabled="onToggleEnabled"
    />

    <RouterSourceModal
      ref="modal"
      v-model:open="modalOpen"
      :targets="targets"
      :saving="saving"
      @save="onSave"
    />

    <UiConfirmDialog
      v-model:open="deleteOpen"
      title="Delete source?"
      confirm-label="Delete"
      danger
      @confirm="confirmDelete"
    >
      <p class="text-sm text-muted">
        Remove
        <span class="font-mono text-ink">{{ deleteSource?.domainNames[0] || deleteSource?.id }}</span>
        and its port binds?
      </p>
    </UiConfirmDialog>
  </div>
</template>
