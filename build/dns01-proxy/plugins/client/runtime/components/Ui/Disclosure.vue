<script setup lang="ts">
import { PhCaretDown as CaretDown } from '@phosphor-icons/vue'

const {
  title,
  open = false,
  flush = false,
} = defineProps<{
  title: string
  open?: boolean
  /** Borderless, for embedding inside another panel. */
  flush?: boolean
}>()
</script>

<template>
  <details
    class="ui-disclosure group"
    :class="flush
      ? 'bg-transparent'
      : 'border border-rule bg-panel'"
    :style="flush ? undefined : 'border-radius: var(--radius-panel)'"
    :open="open || undefined"
  >
    <summary
      class="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-ink marker:content-none [&::-webkit-details-marker]:hidden"
      :class="flush
        ? 'px-0 py-2'
        : 'px-1 py-1 md:gap-3 md:px-4 md:py-3'"
    >
      <span>{{ title }}</span>
      <CaretDown
        :size="16"
        weight="bold"
        class="shrink-0 text-muted transition-transform group-open:rotate-180"
        aria-hidden="true"
      />
    </summary>
    <div
      class="space-y-3"
      :class="flush
        ? 'border-t border-rule pb-2 pt-3'
        : 'border-t border-rule px-1 py-1 md:space-y-4 md:px-4 md:py-4'"
    >
      <slot />
    </div>
  </details>
</template>
