<script setup lang="ts">
import type { AccessListPublic } from '#proxy-shared/types/accessList'
import {
  PhPencilSimple as Pencil,
  PhTrash as Trash,
} from '@phosphor-icons/vue'

defineProps<{
  lists: AccessListPublic[]
}>()

const emit = defineEmits<{
  edit: [list: AccessListPublic]
  remove: [list: AccessListPublic]
}>()
</script>

<template>
  <div class="overflow-x-auto rounded-[var(--radius-panel)] border border-rule">
    <table class="min-w-full text-left text-sm">
      <thead class="border-b border-rule bg-panel text-xs uppercase tracking-wide text-muted">
        <tr>
          <th class="px-3 py-2 font-medium">Name</th>
          <th class="px-3 py-2 font-medium">Rules</th>
          <th class="px-3 py-2 font-medium">Users</th>
          <th class="px-3 py-2 font-medium">Flags</th>
          <th class="px-3 py-2 font-medium text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="list in lists"
          :key="list.id"
          class="border-b border-rule last:border-0 hover:bg-panel/60"
        >
          <td class="px-3 py-2 font-medium text-ink">
            {{ list.name }}
          </td>
          <td class="px-3 py-2 font-mono text-xs text-muted">
            {{ list.rules.length }}
          </td>
          <td class="px-3 py-2 font-mono text-xs text-muted">
            {{ list.users.length }}
          </td>
          <td class="px-3 py-2">
            <div class="flex flex-wrap gap-1">
              <span
                v-if="list.satisfyAny"
                class="rounded border border-rule px-1.5 py-0.5 text-[11px] text-muted"
              >Satisfy Any</span>
              <span
                v-if="list.passAuthUpstream"
                class="rounded border border-rule px-1.5 py-0.5 text-[11px] text-muted"
              >Pass Auth</span>
            </div>
          </td>
          <td class="px-3 py-2">
            <div class="flex justify-end gap-1">
              <UiButton
                variant="icon"
                size="sm"
                aria-label="Edit"
                @click="emit('edit', list)"
              >
                <Pencil :size="14" weight="regular" aria-hidden="true" />
              </UiButton>
              <UiButton
                variant="icon"
                size="sm"
                aria-label="Delete"
                @click="emit('remove', list)"
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
