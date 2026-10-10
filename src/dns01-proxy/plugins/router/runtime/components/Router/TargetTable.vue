<script setup lang="ts">
import type { RouterTarget } from '#router-shared/types/routerTarget'
import {
  PhPencilSimple as Pencil,
  PhTrash as Trash,
} from '@phosphor-icons/vue'

const { targets, togglingId = null } = defineProps<{
  targets: RouterTarget[]
  togglingId?: string | null
}>()

const emit = defineEmits<{
  edit: [target: RouterTarget]
  remove: [target: RouterTarget]
  'toggle-enabled': [target: RouterTarget, enabled: boolean]
}>()
</script>

<template>
  <div class="overflow-x-auto rounded-[var(--radius-panel)] border border-rule">
    <table class="w-full min-w-[36rem] border-collapse text-left text-sm">
      <thead class="bg-paper/60 text-xs uppercase tracking-wide text-muted">
        <tr>
          <th class="px-3 py-2 font-medium">
            Name
          </th>
          <th class="px-3 py-2 font-medium">
            Host
          </th>
          <th class="px-3 py-2 font-medium">
            Notes
          </th>
          <th class="px-3 py-2 font-medium">
            On
          </th>
          <th class="px-3 py-2 font-medium">
            <span class="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="target in targets"
          :key="target.id"
          class="border-t border-rule"
        >
          <td class="px-3 py-2 font-medium text-ink">
            {{ target.name }}
          </td>
          <td class="px-3 py-2 font-mono text-ink">
            {{ target.host }}
          </td>
          <td class="px-3 py-2 text-muted">
            {{ target.notes || '—' }}
          </td>
          <td class="px-3 py-2">
            <input
              type="checkbox"
              class="size-4 accent-[var(--signal)]"
              :checked="target.enabled"
              :disabled="togglingId === target.id"
              :aria-label="`Enable ${target.name}`"
              @change="emit('toggle-enabled', target, ($event.target as HTMLInputElement).checked)"
            >
          </td>
          <td class="px-3 py-2">
            <div class="flex justify-end gap-1">
              <button
                type="button"
                class="rounded p-1.5 text-muted hover:bg-paper hover:text-ink"
                :aria-label="`Edit ${target.name}`"
                @click="emit('edit', target)"
              >
                <Pencil :size="16" />
              </button>
              <button
                type="button"
                class="rounded p-1.5 text-muted hover:bg-paper hover:text-danger"
                :aria-label="`Delete ${target.name}`"
                @click="emit('remove', target)"
              >
                <Trash :size="16" />
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
