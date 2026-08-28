<script setup lang="ts">
import type { CertBatchUploadPreview } from '#shared/types/certs'

const open = defineModel<boolean>('open', { required: true })

const { preview, pending = false } = defineProps<{
  preview: CertBatchUploadPreview | null
  pending?: boolean
}>()

const emit = defineEmits<{
  confirm: [overwrite: string[]]
  cancel: []
}>()

const selected = ref<string[]>([])

watch(() => preview, () => {
  selected.value = []
})

const allConflictsSelected = computed({
  get: () => Boolean(
    preview?.conflicts.length
    && preview.conflicts.every(name => selected.value.includes(name)),
  ),
  set: (value: boolean) => {
    if (!preview) {
      return
    }
    selected.value = value ? [...preview.conflicts] : []
  },
})

const canConfirm = computed(() =>
  Boolean(preview && (preview.newCerts.length > 0 || selected.value.length > 0)),
)

function toggleConflict(certName: string, checked: boolean) {
  if (checked) {
    if (!selected.value.includes(certName)) {
      selected.value = [...selected.value, certName]
    }
    return
  }
  selected.value = selected.value.filter(name => name !== certName)
}

function onConfirm() {
  emit('confirm', [...selected.value])
}

function onCancel() {
  open.value = false
  emit('cancel')
}
</script>

<template>
  <UiModal v-model:open="open" title="Import certificate ZIP" size="lg">
    <p class="text-sm text-muted">
      Choose which existing <span class="font-mono text-ink">live/</span> certificates to replace.
      New folders from the ZIP import automatically.
    </p>

    <template v-if="preview">
      <section v-if="preview.newCerts.length" class="mt-4">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">
          New (will import)
        </h3>
        <ul class="mt-2 space-y-2">
          <li
            v-for="certName in preview.newCerts"
            :key="`new-${certName}`"
            class="flex items-center justify-between gap-3 rounded-[6px] border border-rule px-3 py-2 font-mono text-sm"
          >
            <span class="text-ink">{{ certName }}</span>
            <span class="rounded-[4px] border border-signal px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-signal">
              Import
            </span>
          </li>
        </ul>
      </section>

      <section v-if="preview.conflicts.length" class="mt-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">
            Existing in live/ (overwrite?)
          </h3>
          <label class="inline-flex items-center gap-2 text-sm text-ink">
            <input
              v-model="allConflictsSelected"
              type="checkbox"
              class="accent-[var(--signal)]"
            >
            Select all
          </label>
        </div>
        <ul class="mt-2 space-y-2">
          <li
            v-for="certName in preview.conflicts"
            :key="`conflict-${certName}`"
            class="rounded-[6px] border border-rule px-3 py-2"
          >
            <label class="flex items-center gap-3 font-mono text-sm text-ink">
              <input
                type="checkbox"
                class="accent-[var(--signal)]"
                :checked="selected.includes(certName)"
                @change="toggleConflict(certName, ($event.target as HTMLInputElement).checked)"
              >
              <span class="min-w-0 flex-1">{{ certName }}</span>
              <span class="rounded-[4px] border border-danger px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-danger">
                Replace
              </span>
            </label>
          </li>
        </ul>
      </section>

      <p v-if="!preview.newCerts.length && !preview.conflicts.length" class="mt-4 text-sm text-muted">
        No certificate folders found in this ZIP.
      </p>
    </template>

    <div class="mt-6 flex justify-end gap-2 border-t border-rule pt-4">
      <UiButton type="button" variant="ghost" :disabled="pending" @click="onCancel">
        Cancel
      </UiButton>
      <UiButton type="button" :disabled="!canConfirm || pending" @click="onConfirm">
        {{ pending ? 'Importing…' : 'Import selected' }}
      </UiButton>
    </div>
  </UiModal>
</template>
