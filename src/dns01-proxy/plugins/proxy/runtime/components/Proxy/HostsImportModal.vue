<script setup lang="ts">
import type { ProxyHostImportRow } from '#proxy-shared/utils/proxyHost'
import { forwardTarget } from '#proxy-shared/utils/proxyHost'

const open = defineModel<boolean>('open', { required: true })

const { rows = [], pending = false } = defineProps<{
  rows?: ProxyHostImportRow[]
  pending?: boolean
}>()

const emit = defineEmits<{
  confirm: [keys: string[]]
  cancel: []
}>()

const selected = ref<string[]>([])

watch(
  () => rows,
  (next) => {
    selected.value = next.filter(row => !row.existingSource).map(row => row.key)
  },
  { immediate: true },
)

const allSelected = computed({
  get: () => Boolean(rows.length && rows.every(row => selected.value.includes(row.key))),
  set: (value: boolean) => {
    selected.value = value ? rows.map(row => row.key) : []
  },
})

const canConfirm = computed(() => selected.value.length > 0)

function toggleRow(key: string, checked: boolean) {
  if (checked) {
    if (!selected.value.includes(key)) {
      selected.value = [...selected.value, key]
    }
    return
  }
  selected.value = selected.value.filter(item => item !== key)
}

function onConfirm() {
  emit('confirm', [...selected.value])
}

function onCancel() {
  open.value = false
  emit('cancel')
}

function sourceLabel(row: ProxyHostImportRow): string {
  return row.host.domainNames.join(', ') || row.host.id
}
</script>

<template>
  <UiModal v-model:open="open" title="Import proxy hosts" size="lg">
    <p class="text-sm text-muted">
      Choose which hosts to import. New sources are selected by default; hosts whose
      <span class="text-ink">Source</span> domains already exist stay unchecked
      (matching <span class="text-ink">Forward</span> alone does not).
    </p>

    <template v-if="rows.length">
      <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">
          Hosts in file ({{ rows.length }})
        </h3>
        <label class="inline-flex items-center gap-2 text-sm text-ink">
          <input
            v-model="allSelected"
            type="checkbox"
            class="accent-[var(--signal)]"
          >
          Select all
        </label>
      </div>
      <ul class="mt-2 max-h-[min(24rem,50vh)] space-y-2 overflow-y-auto">
        <li
          v-for="row in rows"
          :key="row.key"
          class="rounded-[6px] border border-rule px-3 py-2"
        >
          <label class="flex items-start gap-3 text-sm text-ink">
            <input
              type="checkbox"
              class="mt-0.5 accent-[var(--signal)]"
              :checked="selected.includes(row.key)"
              @change="toggleRow(row.key, ($event.target as HTMLInputElement).checked)"
            >
            <span class="min-w-0 flex-1">
              <span class="block font-mono text-sm">{{ sourceLabel(row) }}</span>
              <span class="mt-0.5 block font-mono text-xs text-muted">
                {{ forwardTarget(row.host) }}
              </span>
              <span
                v-if="row.existingSource && row.conflictLabels.length"
                class="mt-1 block text-xs text-muted"
              >
                Existing source on {{ row.conflictLabels.join(', ') }}
              </span>
            </span>
            <span
              class="shrink-0 rounded-[4px] border px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
              :class="row.existingSource
                ? 'border-danger text-danger'
                : 'border-signal text-signal'"
            >
              {{ row.existingSource ? 'Replace' : 'Import' }}
            </span>
          </label>
        </li>
      </ul>
    </template>

    <p v-else class="mt-4 text-sm text-muted">
      No proxy hosts found in this file.
    </p>

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
