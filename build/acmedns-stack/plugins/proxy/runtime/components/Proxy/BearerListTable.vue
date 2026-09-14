<script setup lang="ts">
import type { BearerListPublic } from '#proxy-shared/types/bearerKey'
import {
  PhCaretDown as CaretDown,
  PhCopy as Copy,
  PhPencilSimple as Pencil,
  PhTrash as Trash,
} from '@phosphor-icons/vue'

defineProps<{
  lists: BearerListPublic[]
}>()

const emit = defineEmits<{
  edit: [list: BearerListPublic]
  remove: [list: BearerListPublic]
}>()

const expandedId = ref<string | null>(null)
const { copyText } = useClipboardCopy()

function toggle(list: BearerListPublic) {
  expandedId.value = expandedId.value === list.id ? null : list.id
}

function isOpen(list: BearerListPublic) {
  return expandedId.value === list.id
}
</script>

<template>
  <div class="overflow-x-auto rounded-[var(--radius-panel)] border border-rule">
    <table class="min-w-full text-left text-sm">
      <thead class="border-b border-rule bg-panel text-xs uppercase tracking-wide text-muted">
        <tr>
          <th class="px-3 py-2 font-medium">Name</th>
          <th class="px-3 py-2 font-medium">Keys</th>
          <th class="px-3 py-2 font-medium text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        <template
          v-for="list in lists"
          :key="list.id"
        >
          <tr
            class="cursor-pointer border-b border-rule last:border-0 hover:bg-panel/60"
            :class="isOpen(list) && 'bg-panel/40'"
            :aria-expanded="isOpen(list)"
            @click="toggle(list)"
          >
            <td class="px-3 py-2 font-medium text-ink">
              <span class="inline-flex items-center gap-1.5">
                <CaretDown
                  :size="14"
                  weight="bold"
                  class="shrink-0 text-muted transition-transform"
                  :class="isOpen(list) ? 'rotate-0' : '-rotate-90'"
                  aria-hidden="true"
                />
                {{ list.name }}
              </span>
            </td>
            <td class="px-3 py-2 font-mono text-xs text-muted">
              {{ list.keys.length }}
            </td>
            <td class="px-3 py-2">
              <div
                class="flex justify-end gap-1"
                @click.stop
              >
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
          <tr
            v-if="isOpen(list)"
            class="border-b border-rule bg-panel/30 last:border-0"
          >
            <td
              colspan="3"
              class="px-3 py-3"
            >
              <div class="flex flex-col gap-2">
                <p
                  v-if="!list.keys.length"
                  class="text-xs text-muted"
                >
                  No keys in this list.
                </p>
                <div
                  v-for="(key, index) in list.keys"
                  :key="key.id"
                  class="flex items-start gap-2 rounded-[var(--radius-panel)] border border-rule bg-paper px-3 py-2"
                >
                  <div class="min-w-0 flex-1">
                    <p class="text-[11px] uppercase tracking-wide text-muted">
                      Key {{ index + 1 }}
                    </p>
                    <UiCopyable
                      v-if="key.token"
                      class="mt-1"
                      :value="key.token"
                      :label="`Key ${index + 1}`"
                    />
                    <p
                      v-else
                      class="mt-1 font-mono text-xs text-muted"
                    >
                      {{ key.prefix || 'Token not stored — edit to set again' }}
                    </p>
                  </div>
                  <UiButton
                    v-if="key.token"
                    variant="icon"
                    size="sm"
                    aria-label="Copy token"
                    title="Copy token"
                    @click="copyText(key.token, `Key ${index + 1}`, $event)"
                  >
                    <Copy :size="14" weight="regular" aria-hidden="true" />
                  </UiButton>
                </div>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
