<script setup lang="ts">
import type { BearerKeyPublic } from '#proxy-shared/types/bearerKey'
import {
  PhArrowsClockwise as ArrowsClockwise,
  PhPencilSimple as Pencil,
  PhTrash as Trash,
} from '@phosphor-icons/vue'

defineProps<{
  keys: BearerKeyPublic[]
}>()

const emit = defineEmits<{
  edit: [key: BearerKeyPublic]
  rotate: [key: BearerKeyPublic]
  remove: [key: BearerKeyPublic]
}>()

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  }
  catch {
    return iso
  }
}
</script>

<template>
  <div class="overflow-x-auto rounded-[var(--radius-panel)] border border-rule">
    <table class="min-w-full text-left text-sm">
      <thead class="border-b border-rule bg-panel text-xs uppercase tracking-wide text-muted">
        <tr>
          <th class="px-3 py-2 font-medium">Name</th>
          <th class="px-3 py-2 font-medium">Prefix</th>
          <th class="px-3 py-2 font-medium">Updated</th>
          <th class="px-3 py-2 font-medium text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="key in keys"
          :key="key.id"
          class="border-b border-rule last:border-0 hover:bg-panel/60"
        >
          <td class="px-3 py-2 font-medium text-ink">
            {{ key.name }}
          </td>
          <td class="px-3 py-2 font-mono text-xs text-muted">
            {{ key.prefix }}
          </td>
          <td class="px-3 py-2 text-xs text-muted">
            {{ formatWhen(key.updatedAt) }}
          </td>
          <td class="px-3 py-2">
            <div class="flex justify-end gap-1">
              <UiButton
                variant="icon"
                size="sm"
                aria-label="Edit"
                @click="emit('edit', key)"
              >
                <Pencil :size="14" weight="regular" aria-hidden="true" />
              </UiButton>
              <UiButton
                variant="icon"
                size="sm"
                aria-label="Rotate token"
                title="Rotate token"
                @click="emit('rotate', key)"
              >
                <ArrowsClockwise :size="14" weight="regular" aria-hidden="true" />
              </UiButton>
              <UiButton
                variant="icon"
                size="sm"
                aria-label="Delete"
                @click="emit('remove', key)"
              >
                <Trash :size="14" weight="regular" aria-hidden="true" />
              </UiButton>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
