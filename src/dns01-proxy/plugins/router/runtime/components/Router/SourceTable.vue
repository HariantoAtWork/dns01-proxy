<script setup lang="ts">
import type { RouterSource } from '#router-shared/types/routerSource'
import type { RouterTarget } from '#router-shared/types/routerTarget'
import { formatPortMapsSummary } from '#router-shared/utils/routerSource'
import type { RouterSourceHealth } from '../../composables/useRouterSources'
import {
  PhCircle as Circle,
  PhPencilSimple as Pencil,
  PhTrash as Trash,
} from '@phosphor-icons/vue'

const {
  sources,
  targets = [],
  healthById = {},
  togglingId = null,
} = defineProps<{
  sources: RouterSource[]
  targets?: RouterTarget[]
  healthById?: Record<string, RouterSourceHealth>
  togglingId?: string | null
}>()

const emit = defineEmits<{
  edit: [source: RouterSource]
  remove: [source: RouterSource]
  'toggle-enabled': [source: RouterSource, enabled: boolean]
}>()

function targetName(source: RouterSource): string {
  const target = targets.find(item => item.id === source.targetId)
  return target ? `${target.name} (${target.host})` : '—'
}

function statusLabel(source: RouterSource): string {
  if (!source.enabled) {
    return 'Off'
  }
  const health = healthById[source.id]
  if (!health) {
    return '…'
  }
  return health.online ? 'Online' : 'Offline'
}

function statusClass(source: RouterSource): string {
  if (!source.enabled) {
    return 'text-muted'
  }
  const health = healthById[source.id]
  if (!health) {
    return 'text-muted'
  }
  return health.online ? 'text-live' : 'text-danger'
}
</script>

<template>
  <div class="overflow-x-auto rounded-[var(--radius-panel)] border border-rule">
    <table class="w-full min-w-[48rem] border-collapse text-left text-sm">
      <thead class="bg-paper/60 text-xs uppercase tracking-wide text-muted">
        <tr>
          <th class="px-3 py-2 font-medium">
            Source
          </th>
          <th class="px-3 py-2 font-medium">
            Target
          </th>
          <th class="px-3 py-2 font-medium">
            Ports
          </th>
          <th class="px-3 py-2 font-medium">
            Status
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
          v-for="source in sources"
          :key="source.id"
          class="border-t border-rule align-top"
        >
          <td class="px-3 py-2">
            <ul class="flex flex-col gap-0.5">
              <li
                v-for="name in source.domainNames"
                :key="name"
                class="font-mono text-ink"
              >
                {{ name }}
              </li>
            </ul>
          </td>
          <td class="px-3 py-2 text-ink">
            {{ targetName(source) }}
          </td>
          <td class="max-w-[18rem] px-3 py-2 font-mono text-xs text-muted">
            {{ formatPortMapsSummary(source.portMaps) }}
          </td>
          <td class="px-3 py-2">
            <span
              class="inline-flex items-center gap-1.5"
              :class="statusClass(source)"
            >
              <Circle
                :size="10"
                weight="fill"
                aria-hidden="true"
              />
              {{ statusLabel(source) }}
            </span>
          </td>
          <td class="px-3 py-2">
            <input
              type="checkbox"
              class="size-4 accent-[var(--signal)]"
              :checked="source.enabled"
              :disabled="togglingId === source.id"
              :aria-label="`Enable ${source.domainNames[0] || source.id}`"
              @change="emit('toggle-enabled', source, ($event.target as HTMLInputElement).checked)"
            >
          </td>
          <td class="px-3 py-2">
            <div class="flex justify-end gap-1">
              <button
                type="button"
                class="rounded p-1.5 text-muted hover:bg-paper hover:text-ink"
                :aria-label="`Edit ${source.domainNames[0] || source.id}`"
                @click="emit('edit', source)"
              >
                <Pencil :size="16" />
              </button>
              <button
                type="button"
                class="rounded p-1.5 text-muted hover:bg-paper hover:text-danger"
                :aria-label="`Delete ${source.domainNames[0] || source.id}`"
                @click="emit('remove', source)"
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
