<script setup lang="ts">
import { PhCheckCircle as CheckCircle, PhWarningCircle as WarningCircle, PhCopy as Copy } from '@phosphor-icons/vue'

const { items, dismiss } = useToasts()

const toneClass: Record<string, string> = {
  ok: 'border-signal text-ink',
  error: 'border-danger text-ink',
  info: 'border-rule text-ink',
}
</script>

<template>
  <div
    class="pointer-events-none fixed right-4 top-20 z-[30] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    aria-live="polite"
  >
    <div
      v-for="item in items"
      :key="item.id"
      class="pointer-events-auto flex items-start gap-3 border bg-panel px-3 py-3 shadow-[0_8px_24px_var(--shadow)]"
      :class="toneClass[item.tone]"
      style="border-radius: var(--radius-panel)"
    >
      <CheckCircle v-if="item.tone === 'ok'" :size="18" class="mt-0.5 text-signal" weight="regular" />
      <WarningCircle v-else-if="item.tone === 'error'" :size="18" class="mt-0.5 text-danger" weight="regular" />
      <Copy v-else :size="18" class="mt-0.5 text-muted" weight="regular" />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium">{{ item.title }}</p>
        <p class="text-sm text-muted">{{ item.detail }}</p>
      </div>
      <button
        type="button"
        class="text-sm text-muted hover:text-ink"
        :aria-label="`Dismiss ${item.title}`"
        @click="dismiss(item.id)"
      >
        Close
      </button>
    </div>
  </div>
</template>
