<script setup lang="ts">
import { PhInfo as Info } from '@phosphor-icons/vue'

const open = defineModel<boolean>({ default: false })

const { label = 'More information' } = defineProps<{
  /** Accessible name for the info toggle. */
  label?: string
}>()

const panelId = useId()

function toggle() {
  open.value = !open.value
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between gap-3 text-sm">
      <span class="inline-flex min-w-0 items-center gap-1.5">
        <slot name="title" />
        <button
          type="button"
          class="inline-flex shrink-0 rounded-[6px] p-0.5 text-muted transition-colors hover:bg-panel hover:text-ink"
          :aria-expanded="open"
          :aria-controls="panelId"
          :aria-label="label"
          @click="toggle"
        >
          <Info
            :size="16"
            :weight="open ? 'fill' : 'regular'"
            aria-hidden="true"
          />
        </button>
      </span>
      <slot name="action" />
    </div>

    <slot />

    <div
      v-show="open"
      :id="panelId"
      class="text-xs text-muted"
      role="region"
      :aria-label="label"
    >
      <slot name="info" />
    </div>
  </div>
</template>
