<script setup lang="ts">
import type { DomainEntry } from '#shared/types/clientstorage'

const { entries, selected } = defineProps<{
  entries: DomainEntry[]
  selected: string
}>()

const emit = defineEmits<{
  select: [domain: string]
}>()
</script>

<template>
  <nav aria-label="Stored domains">
    <ul class="divide-y divide-rule">
      <li v-for="entry in entries" :key="entry.domain">
        <button
          type="button"
          class="flex w-full flex-col items-start gap-1 px-3 py-3 text-left hover:bg-panel"
          :class="selected === entry.domain && 'bg-panel'"
          :aria-current="selected === entry.domain ? 'true' : undefined"
          @click="emit('select', entry.domain)"
        >
          <span class="font-medium">{{ entry.domain }}</span>
          <span class="w-full truncate font-mono text-xs text-muted">{{ entry.details.fulldomain }}</span>
        </button>
      </li>
    </ul>
  </nav>
</template>
