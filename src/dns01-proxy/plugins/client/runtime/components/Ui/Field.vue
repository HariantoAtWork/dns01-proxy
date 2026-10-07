<script setup lang="ts">
import { PhInfo as Info } from '@phosphor-icons/vue'

const {
  label,
  hint,
  info,
  error,
  for: forId,
} = defineProps<{
  label: string
  /** Short always-visible note beside the label. */
  hint?: string
  /** Longer help behind an info icon. */
  info?: string
  error?: string
  for?: string
}>()

const generatedId = useId()
const fieldId = computed(() => forId || generatedId)
const infoOpen = defineModel<boolean>('infoOpen', { default: false })
const panelId = useId()

function toggleInfo() {
  infoOpen.value = !infoOpen.value
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-baseline justify-between gap-3">
      <span class="inline-flex min-w-0 items-center gap-1.5">
        <label :for="fieldId" class="text-sm font-medium text-ink">{{ label }}</label>
        <button
          v-if="info"
          type="button"
          class="inline-flex shrink-0 rounded-[6px] p-0.5 text-muted transition-colors hover:bg-panel hover:text-ink"
          :aria-expanded="infoOpen"
          :aria-controls="panelId"
          :aria-label="`About ${label}`"
          @click="toggleInfo"
        >
          <Info
            :size="16"
            :weight="infoOpen ? 'fill' : 'regular'"
            aria-hidden="true"
          />
        </button>
      </span>
      <span v-if="hint" class="text-xs text-muted">{{ hint }}</span>
    </div>
    <slot :id="fieldId" />
    <div
      v-if="info"
      v-show="infoOpen"
      :id="panelId"
      class="text-xs text-muted"
      role="region"
      :aria-label="`About ${label}`"
    >
      {{ info }}
    </div>
    <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
  </div>
</template>
