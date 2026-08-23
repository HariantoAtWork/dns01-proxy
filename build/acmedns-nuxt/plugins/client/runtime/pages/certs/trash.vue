<script setup lang="ts">
import { PhTrash as Trash } from '@phosphor-icons/vue'

useHead({ title: 'Certificate trash' })

const toasts = useToasts()
const { trashItems, pending, loadTrash, restoreTrash, permanentDelete } = useCerts()
const confirmName = ref<string | null>(null)
const confirmOpen = computed({
  get: () => Boolean(confirmName.value),
  set: (v: boolean) => {
    if (!v) {
      confirmName.value = null
    }
  },
})

onMounted(async () => {
  try {
    await loadTrash()
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Failed to load trash')
  }
})

async function onRestore(name: string) {
  try {
    await restoreTrash(name)
    toasts.ok(`Restored ${name}`)
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Restore failed')
  }
}

async function onPerma(name: string) {
  try {
    await permanentDelete(name)
    confirmName.value = null
    toasts.ok(`Permanently deleted ${name}`)
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Delete failed')
  }
}
</script>

<template>
  <div class="mx-auto max-w-[1200px] space-y-6 px-1 py-4 md:px-6 md:py-8">
    <div>
      <NuxtLink to="/certs" class="text-sm text-muted no-underline hover:text-ink">
        ← Certificates
      </NuxtLink>
      <h1 class="mt-2 flex items-center gap-2 text-xl font-semibold text-ink md:text-2xl">
        <Trash :size="24" weight="regular" aria-hidden="true" />
        Trash
      </h1>
      <p class="mt-1 text-sm text-muted">
        Soft-deleted PEMs. Restore undoes; permanent delete wipes files under
        <span class="font-mono">trash/</span>.
      </p>
    </div>

    <UiPanel>
      <div v-if="!trashItems.length" class="text-sm text-muted">
        Trash is empty.
      </div>
      <ul v-else class="divide-y divide-rule">
        <li
          v-for="item in trashItems"
          :key="item.certName"
          class="flex flex-wrap items-center justify-between gap-3 py-3"
        >
          <div>
            <p class="font-mono text-sm text-ink">
              {{ item.certName }}
            </p>
            <p class="text-xs text-muted">
              From {{ item.fromTree }}/ · trashed {{ new Date(item.trashedAt).toLocaleString() }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UiButton variant="ghost" size="sm" :disabled="pending" @click="onRestore(item.certName)">
              Undo
            </UiButton>
            <UiButton
              variant="danger"
              size="sm"
              :disabled="pending"
              @click="confirmName = item.certName"
            >
              Delete forever
            </UiButton>
          </div>
        </li>
      </ul>
    </UiPanel>

    <UiConfirmDialog
      v-model:open="confirmOpen"
      title="Permanent delete?"
      confirm-label="Delete forever"
      danger
      @confirm="confirmName && onPerma(confirmName)"
      @cancel="confirmName = null"
    >
      <p v-if="confirmName">
        This removes all PEMs for <span class="font-mono text-ink">{{ confirmName }}</span> from trash. Cannot undo.
      </p>
    </UiConfirmDialog>
  </div>
</template>
