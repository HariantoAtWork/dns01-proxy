<script setup lang="ts">
import { PhCaretDown as CaretDown } from '@phosphor-icons/vue'

const {
  title,
  open = false,
} = defineProps<{
  title: string
  open?: boolean
}>()
</script>

<template>
  <details
    class="ui-disclosure group border border-rule bg-panel"
    style="border-radius: var(--radius-panel)"
    :open="open || undefined"
  >
    <summary
      class="flex cursor-pointer list-none items-center justify-between gap-2 px-1 py-1 text-sm font-medium text-ink marker:content-none md:gap-3 md:px-4 md:py-3 [&::-webkit-details-marker]:hidden"
    >
      <span>{{ title }}</span>
      <CaretDown
        :size="16"
        weight="bold"
        class="shrink-0 text-muted transition-transform group-open:rotate-180"
        aria-hidden="true"
      />
    </summary>
    <div class="space-y-3 border-t border-rule px-1 py-1 md:space-y-4 md:px-4 md:py-4">
      <slot />
    </div>
  </details>
</template>
