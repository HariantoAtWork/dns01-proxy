<script setup lang="ts">
import type { ProxyHost, ProxyHostInput } from '#proxy-shared/types/proxyHost'
import {
  PhArrowsClockwise as ArrowsClockwise,
  PhPlus as Plus,
  PhSwap as Swap,
} from '@phosphor-icons/vue'

useHead({ title: 'Proxy Hosts' })

const toasts = useToasts()
const {
  hosts,
  certEntries,
  healthById,
  pending,
  error,
  loadHosts,
  loadCertNames,
  loadAllHealth,
  saveHost,
  removeHost,
} = useProxyHosts()

const { lists: accessLists, loadLists: loadAccessLists } = useAccessLists()

const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const togglingId = ref<string | null>(null)
const deleteOpen = ref(false)
const deleteTarget = ref<ProxyHost | null>(null)
const modalRef = useTemplateRef<{ load: (host?: ProxyHost | null) => void }>('modal')

async function refresh() {
  try {
    await Promise.all([loadHosts(), loadCertNames(), loadAccessLists()])
    await loadAllHealth()
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

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex flex-col gap-1">
        <div class="flex items-center gap-2">
          <Swap
            :size="22"
            weight="duotone"
            class="text-signal"
            aria-hidden="true"
          />
          <h1 class="text-2xl font-semibold tracking-tight text-ink">
            Proxy Hosts
          </h1>
        </div>
        <p class="text-sm text-muted">
          Bun reverse proxy on <span class="font-mono">:80/:443</span>.
          Operator UI and acme-dns API stay on
          <span class="font-mono">:1080/:1443</span>.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
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
      :cert-entries="certEntries"
      :toggling-id="togglingId"
      @edit="openEdit"
      @remove="askDelete"
      @toggle-enabled="onToggleEnabled"
    />

    <ProxyHostModal
      ref="modal"
      v-model:open="modalOpen"
      :cert-entries="certEntries"
      :access-lists="accessLists"
      :saving
      @save="onSave"
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
