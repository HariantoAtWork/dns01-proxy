<script setup lang="ts">
import type { AccessListInput, AccessListPublic } from '#proxy-shared/types/accessList'
import {
  PhArrowsClockwise as ArrowsClockwise,
  PhPlus as Plus,
  PhShieldCheck as Shield,
} from '@phosphor-icons/vue'

useHead({ title: 'Access Lists' })

const toasts = useToasts()
const {
  lists,
  settings,
  denies,
  pending,
  error,
  loadLists,
  loadSettings,
  saveSettings,
  loadDenies,
  fetchClientIp,
  saveList,
  removeList,
} = useAccessLists()

const modalOpen = ref(false)
const saving = ref(false)
const deleteOpen = ref(false)
const deleteTarget = ref<AccessListPublic | null>(null)
const modalRef = useTemplateRef<{ load: (list?: AccessListPublic | null, options?: { allowIp?: string }) => void }>('modal')
const savingTrust = ref(false)

async function refresh() {
  try {
    await Promise.all([loadLists(), loadSettings(), loadDenies()])
  }
  catch {
    toasts.error(error.value || 'Failed to load access lists', 'Proxy')
  }
}

function openCreate() {
  modalOpen.value = true
  nextTick(() => {
    modalRef.value?.load(null)
  })
}

function openEdit(list: AccessListPublic) {
  modalOpen.value = true
  nextTick(() => {
    modalRef.value?.load(list)
  })
}

async function onSave(input: AccessListInput) {
  saving.value = true
  try {
    await saveList(input)
    modalOpen.value = false
    toasts.ok(input.id ? 'Access list updated' : 'Access list created', 'Proxy')
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed'
    toasts.error(message, 'Proxy')
  }
  finally {
    saving.value = false
  }
}

function askDelete(list: AccessListPublic) {
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

async function onToggleTrust(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  savingTrust.value = true
  try {
    await saveSettings({ trustForwardedClientIp: checked })
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save setting'
    toasts.error(message, 'Proxy')
  }
  finally {
    savingTrust.value = false
  }
}

async function allowDeniedIp(ip: string) {
  if (!ip || ip === 'unknown') {
    return
  }
  modalOpen.value = true
  await nextTick()
  modalRef.value?.load(null, { allowIp: ip })
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
          <Shield
            :size="22"
            weight="duotone"
            class="text-signal"
            aria-hidden="true"
          />
          <h1 class="text-2xl font-semibold tracking-tight text-ink">
            Access Lists
          </h1>
        </div>
        <p class="text-sm text-muted">
          Gate Proxy Hosts by IP/CIDR and optional Basic Auth. Bind a list on each host.
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
          Add Access List
        </UiButton>
      </div>
    </div>

    <div class="flex flex-col gap-2 rounded-[var(--radius-panel)] border border-rule bg-panel p-4">
      <label class="flex items-center justify-between gap-3 text-sm">
        <span class="font-medium">Trust forwarded client IP</span>
        <input
          type="checkbox"
          class="size-4"
          :checked="settings.trustForwardedClientIp"
          :disabled="savingTrust"
          @change="onToggleTrust"
        >
      </label>
      <p class="text-xs text-muted">
        Turn on only when Cloudflare, a tunnel, or another reverse proxy terminates clients in front of this edge and sets real client IPs.
        When off, Access Lists use the Bun peer address only (forged CF / X-Forwarded-For headers are ignored).
      </p>
    </div>

    <div
      v-if="denies.length"
      class="flex flex-col gap-2 rounded-[var(--radius-panel)] border border-rule p-4"
    >
      <h2 class="text-sm font-medium">
        Recent denies
      </h2>
      <ul class="flex flex-col gap-1 text-xs text-muted">
        <li
          v-for="(entry, index) in denies.slice(0, 10)"
          :key="`${entry.at}-${index}`"
          class="flex flex-wrap items-center justify-between gap-2"
        >
          <span class="font-mono">
            {{ entry.ip }} → {{ entry.domain }}
            <span class="text-muted">({{ entry.reason }})</span>
          </span>
          <UiButton
            v-if="entry.ip && entry.ip !== 'unknown'"
            variant="ghost"
            size="sm"
            @click="allowDeniedIp(entry.ip)"
          >
            Allow this IP
          </UiButton>
        </li>
      </ul>
    </div>

    <div
      v-if="!pending && !lists.length"
      class="border border-dashed border-rule bg-panel px-5 py-10"
      style="border-radius: var(--radius-panel)"
    >
      <h2 class="text-xl font-semibold tracking-tight">
        No access lists yet
      </h2>
      <p class="mt-2 max-w-[65ch] text-muted">
        Create a list (e.g. allow Tailscale), then select it on a Proxy Host instead of Publicly Accessible.
      </p>
      <UiButton
        class="mt-6"
        @click="openCreate"
      >
        Add Access List
      </UiButton>
    </div>

    <ProxyAccessListTable
      v-else
      :lists
      @edit="openEdit"
      @remove="askDelete"
    />

    <ProxyAccessListModal
      ref="modal"
      v-model:open="modalOpen"
      :saving
      :fetch-client-ip="fetchClientIp"
      @save="onSave"
    />

    <UiConfirmDialog
      v-model:open="deleteOpen"
      title="Delete access list?"
      confirm-label="Delete"
      danger
      @confirm="confirmDelete"
    >
      <p class="text-sm text-muted">
        Remove
        <span class="font-mono text-ink">{{ deleteTarget?.name }}</span>.
        Hosts still using this list will block the delete.
      </p>
    </UiConfirmDialog>
  </div>
</template>
