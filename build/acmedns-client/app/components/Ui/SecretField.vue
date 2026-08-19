<script setup lang="ts">
import { PhCopy as Copy, PhEye as Eye, PhEyeSlash as EyeSlash } from '@phosphor-icons/vue'

const {
  label,
  value,
  secret = true,
  hint,
} = defineProps<{
  label: string
  value: string
  secret?: boolean
  hint?: string
}>()

const revealed = ref(false)
const { copyText } = useClipboardCopy()
const id = useId()

const display = computed(() => {
  if (!secret || revealed.value) {
    return value
  }
  return value ? '•'.repeat(Math.min(value.length, 24)) : ''
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-baseline justify-between gap-3">
      <label :for="id" class="text-sm font-medium text-ink">{{ label }}</label>
      <span v-if="hint" class="text-xs text-muted">{{ hint }}</span>
    </div>
    <div class="flex items-stretch gap-2">
      <input
        :id
        class="min-w-0 flex-1 border border-rule bg-paper px-3 py-2 font-mono text-sm text-ink"
        style="border-radius: var(--radius-input)"
        :value="display"
        readonly
        :type="secret && !revealed ? 'password' : 'text'"
        autocomplete="off"
        spellcheck="false"
      >
      <button
        v-if="secret"
        type="button"
        class="inline-flex items-center gap-1 border border-rule px-2 text-sm text-muted hover:text-ink"
        style="border-radius: var(--radius-input)"
        :aria-pressed="revealed"
        @click="revealed = !revealed"
      >
        <EyeSlash v-if="revealed" :size="16" weight="regular" />
        <Eye v-else :size="16" weight="regular" />
        <span class="sr-only">{{ revealed ? 'Hide' : 'Reveal' }} {{ label }}</span>
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1 border border-rule px-2 text-sm text-muted hover:text-ink"
        style="border-radius: var(--radius-input)"
        @click="copyText(value, label)"
      >
        <Copy :size="16" weight="regular" />
        <span class="sr-only">Copy {{ label }}</span>
      </button>
    </div>
  </div>
</template>
