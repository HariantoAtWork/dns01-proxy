<script setup lang="ts">
const tab = defineModel<string>({ required: true })

defineProps<{
  tabs: Array<{ id: string, label: string }>
  ariaLabel: string
}>()
</script>

<template>
  <div
    class="sticky top-0 z-[1] -mx-1 flex flex-wrap gap-1 border-b border-rule bg-panel pb-2"
    role="tablist"
    :aria-label="ariaLabel"
  >
    <button
      v-for="item in tabs"
      :key="item.id"
      type="button"
      role="tab"
      class="rounded-[6px] px-3 py-1.5 text-sm"
      :class="tab === item.id
        ? 'bg-signal text-signal-ink'
        : 'text-muted hover:bg-panel hover:text-ink'"
      :aria-selected="tab === item.id"
      @click.stop="tab = item.id"
    >
      {{ item.label }}
    </button>
  </div>
</template>
