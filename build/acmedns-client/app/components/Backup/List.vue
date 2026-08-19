<script setup lang="ts">
import { PhArrowCounterClockwise as Restore, PhTrash as Trash } from '@phosphor-icons/vue'
import type { BackupListItem } from '#shared/types/backup'

const { items, liveDomains, busyFile = '' } = defineProps<{
  items: BackupListItem[]
  liveDomains: string[]
  busyFile?: string
}>()

const emit = defineEmits<{
  restore: [item: BackupListItem]
  remove: [item: BackupListItem]
}>()

function stamp(value: string) {
  return value.replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')
}

function sizeLabel(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  return `${(bytes / 1024).toFixed(1)} KiB`
}

function restoreHint(item: BackupListItem) {
  if (item.kind === 'full') {
    return 'Replace live clientstorage.json'
  }
  if (item.domain && liveDomains.includes(item.domain)) {
    return `${item.domain} already exists — overwrite`
  }
  return item.domain ? `Merge ${item.domain}` : 'Merge hostname'
}
</script>

<template>
  <div class="overflow-x-auto border border-rule bg-panel" style="border-radius: var(--radius-panel)">
    <table class="w-full min-w-[40rem] border-collapse text-left text-sm">
      <thead class="border-b border-rule text-muted">
        <tr>
          <th class="px-3 py-2 font-medium">Kind</th>
          <th class="px-3 py-2 font-medium">Hostname</th>
          <th class="px-3 py-2 font-medium">Written</th>
          <th class="px-3 py-2 font-medium">File</th>
          <th class="px-3 py-2 font-medium">Size</th>
          <th class="px-3 py-2 font-medium"><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-rule">
        <tr v-for="item in items" :key="item.filename">
          <td class="px-3 py-3 align-top">
            <span class="font-medium">{{ item.kind === 'full' ? 'Full' : 'Domain' }}</span>
          </td>
          <td class="px-3 py-3 align-top font-mono text-xs">
            {{ item.kind === 'domain' ? (item.domain || '—') : 'all' }}
          </td>
          <td class="px-3 py-3 align-top font-mono text-xs text-muted">
            {{ stamp(item.createdAt) }}
          </td>
          <td class="px-3 py-3 align-top font-mono text-xs text-muted">
            {{ item.filename }}
          </td>
          <td class="px-3 py-3 align-top font-mono text-xs text-muted">
            {{ sizeLabel(item.size) }}
          </td>
          <td class="px-3 py-3 align-top">
            <div class="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-[6px] bg-signal px-2 py-1 text-xs text-signal-ink disabled:opacity-50"
                :disabled="Boolean(busyFile)"
                :title="restoreHint(item)"
                @click="emit('restore', item)"
              >
                <Restore :size="14" weight="regular" aria-hidden="true" />
                Restore
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-[6px] border border-danger px-2 py-1 text-xs text-danger hover:bg-paper disabled:opacity-50"
                :disabled="Boolean(busyFile)"
                @click="emit('remove', item)"
              >
                <Trash :size="14" weight="regular" aria-hidden="true" />
                Delete
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
