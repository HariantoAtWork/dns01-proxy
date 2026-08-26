<script setup lang="ts">
const {
  value,
  label = 'Value',
  muted = false,
  inline = false,
} = defineProps<{
  value: string
  label?: string
  muted?: boolean
  /** Sit inline with surrounding copy (e.g. Cloudflare short Name). */
  inline?: boolean
}>()

const { copyText } = useClipboardCopy()
</script>

<template>
  <button
    type="button"
    class="cursor-copy select-all font-mono hover:text-signal"
    :class="[
      inline ? 'inline' : 'block max-w-full break-all text-left',
      muted ? 'text-muted' : 'text-ink',
    ]"
    :title="`Copy ${value}`"
    @click="copyText(value, label)"
  >
    {{ value }}
  </button>
</template>
