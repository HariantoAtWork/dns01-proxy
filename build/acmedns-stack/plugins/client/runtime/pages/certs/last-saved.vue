<script setup lang="ts">
import { PhFloppyDisk as FloppyDisk } from '@phosphor-icons/vue'
import type { LastSavedItem } from '#shared/types/certs'

useHead({ title: 'Last saved certificates' })

const toasts = useToasts()
const {
  lastSavedItems,
  pending,
  loadLastSaved,
  restoreLastSaved,
  permanentDeleteLastSaved,
} = useCerts()

type ConfirmTarget = { certName: string, fromTree: 'live' | 'staging' }
const confirmTarget = ref<ConfirmTarget | null>(null)
const confirmOpen = computed({
  get: () => Boolean(confirmTarget.value),
  set: (v: boolean) => {
    if (!v) {
      confirmTarget.value = null
    }
  },
})

/** Group live + staging last-saved under one domain row. */
const grouped = computed(() => {
  const map = new Map<string, { live?: LastSavedItem, staging?: LastSavedItem }>()
  for (const item of lastSavedItems.value) {
    const row = map.get(item.certName) ?? {}
    if (item.fromTree === 'staging') {
      row.staging = item
    }
    else {
      row.live = item
    }
    map.set(item.certName, row)
  }
  return [...map.entries()]
    .map(([certName, trees]) => ({ certName, ...trees }))
    .sort((a, b) => a.certName.localeCompare(b.certName))
})

onMounted(async () => {
  try {
    await loadLastSaved()
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Failed to load last saved')
  }
})

async function onRestore(name: string, fromTree: 'live' | 'staging') {
  try {
    await restoreLastSaved(name, fromTree)
    toasts.ok(`Restored ${fromTree}/${name}`)
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Restore failed')
  }
}

async function onPerma() {
  const target = confirmTarget.value
  if (!target) {
    return
  }
  try {
    await permanentDeleteLastSaved(target.certName, target.fromTree)
    confirmTarget.value = null
    toasts.ok(`Permanently deleted last-saved ${target.fromTree}/${target.certName}`)
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Delete failed')
  }
}

function treeLabel(item: LastSavedItem) {
  const expiry = item.notAfter
    ? ` · expires ${new Date(item.notAfter).toLocaleString()}`
    : ''
  return `${item.fromTree}/ · saved ${new Date(item.savedAt).toLocaleString()}${expiry}`
}
</script>

<template>
  <div class="mx-auto max-w-[1200px] space-y-6 px-1 py-4 md:px-6 md:py-8">
    <div>
      <NuxtLink to="/certs" class="text-sm text-muted no-underline hover:text-ink">
        ← Certificates
      </NuxtLink>
      <h1 class="mt-2 flex items-center gap-2 text-xl font-semibold text-ink md:text-2xl">
        <FloppyDisk :size="24" weight="regular" aria-hidden="true" />
        Last Saved
      </h1>
      <p class="mt-1 text-sm text-muted">
        Previous PEMs kept when a certificate is replaced. Live and staging are stored separately under
        <span class="font-mono">last-saved/</span>. Undo restores that tree; permanent delete wipes the snapshot.
      </p>
    </div>

    <UiPanel>
      <div v-if="!grouped.length" class="text-sm text-muted">
        No last-saved certificates yet. Snapshots appear after a renew or apply replaces an existing cert.
      </div>
      <ul v-else class="divide-y divide-rule">
        <li
          v-for="row in grouped"
          :key="row.certName"
          class="space-y-3 py-3"
        >
          <p class="font-mono text-sm text-ink">
            {{ row.certName }}
          </p>
          <div
            v-if="row.live"
            class="flex flex-wrap items-center justify-between gap-3 pl-0 sm:pl-2"
          >
            <p class="text-xs text-muted">
              {{ treeLabel(row.live) }}
            </p>
            <div class="flex flex-wrap gap-2">
              <UiButton
                variant="ghost"
                size="sm"
                :disabled="pending"
                @click="onRestore(row.certName, 'live')"
              >
                Undo
              </UiButton>
              <UiButton
                variant="danger"
                size="sm"
                :disabled="pending"
                @click="confirmTarget = { certName: row.certName, fromTree: 'live' }"
              >
                Delete forever
              </UiButton>
            </div>
          </div>
          <div
            v-if="row.staging"
            class="flex flex-wrap items-center justify-between gap-3 pl-0 sm:pl-2"
          >
            <p class="text-xs text-muted">
              {{ treeLabel(row.staging) }}
            </p>
            <div class="flex flex-wrap gap-2">
              <UiButton
                variant="ghost"
                size="sm"
                :disabled="pending"
                @click="onRestore(row.certName, 'staging')"
              >
                Undo
              </UiButton>
              <UiButton
                variant="danger"
                size="sm"
                :disabled="pending"
                @click="confirmTarget = { certName: row.certName, fromTree: 'staging' }"
              >
                Delete forever
              </UiButton>
            </div>
          </div>
        </li>
      </ul>
    </UiPanel>

    <UiConfirmDialog
      v-model:open="confirmOpen"
      title="Permanent delete?"
      confirm-label="Delete forever"
      danger
      @confirm="onPerma"
      @cancel="confirmTarget = null"
    >
      <p v-if="confirmTarget">
        This removes the last-saved PEMs for
        <span class="font-mono text-ink">{{ confirmTarget.fromTree }}/{{ confirmTarget.certName }}</span>.
        Cannot undo.
      </p>
    </UiConfirmDialog>
  </div>
</template>
