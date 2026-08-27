<script setup lang="ts">
const {
  value,
  label = 'Value',
  muted = false,
  inline = false,
  truncate = false,
} = defineProps<{
  value: string
  label?: string
  muted?: boolean
  /** Sit inline with surrounding copy (e.g. Cloudflare short Name). */
  inline?: boolean
  /** Single-line ellipsis instead of breaking mid-word. */
  truncate?: boolean
}>()

const { copyText } = useClipboardCopy()
</script>

<template>
  <button
    type="button"
    class="cursor-copy select-all font-mono hover:text-signal"
    :class="[
      inline && !truncate ? 'inline' : 'block max-w-full text-left',
      truncate ? 'truncate' : (!inline && 'break-all'),
      muted ? 'text-muted' : 'text-ink',
    ]"
    :title="`Copy ${value}`"
    @click="copyText(value, label, $event)"
  >
    {{ value }}
  </button>
</template>
