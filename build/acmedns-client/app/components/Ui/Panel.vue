<script setup lang="ts">
const {
  accent = false,
  padding = 'md',
} = defineProps<{
  accent?: boolean
  padding?: 'none' | 'sm' | 'md'
}>()

const paddingClass = computed(() => {
  switch (padding) {
    case 'none':
      return ''
    case 'sm':
      return 'p-1 md:p-3'
    default:
      return 'p-4'
  }
})
</script>

<template>
  <div
    class="ui-panel border border-rule bg-panel"
    :class="[
      paddingClass,
      accent ? 'border-l-4 border-l-signal' : '',
    ]"
    style="border-radius: var(--radius-panel)"
  >
    <slot />
  </div>
</template>
