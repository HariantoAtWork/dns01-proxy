<script setup lang="ts">
import { PhCopy as Copy, PhEye as Eye, PhEyeSlash as EyeSlash } from '@phosphor-icons/vue'
import { useClipboardCopy } from '#client/composables/useClipboardCopy'

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

const inputPadClass = computed(() => (secret ? 'pr-16' : 'pr-10'))
</script>

<template>
  <UiField :label :hint :for="id">
    <div
      class="ui-input-shell relative flex items-center border border-rule bg-paper"
      style="border-radius: var(--radius-input)"
    >
      <input
        :id
        class="ui-input min-w-0 w-full border-0 bg-transparent px-3 py-2 font-mono text-sm text-ink outline-none"
        :class="inputPadClass"
        :value="display"
        readonly
        :type="secret && !revealed ? 'password' : 'text'"
        autocomplete="off"
        spellcheck="false"
      >
      <div class="absolute inset-y-0 right-0 flex items-center gap-0.5 pr-1">
        <button
          v-if="secret"
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-muted hover:bg-panel hover:text-ink"
          :aria-pressed="revealed"
          :aria-label="revealed ? `Hide ${label}` : `Reveal ${label}`"
          @click="revealed = !revealed"
        >
          <EyeSlash v-if="revealed" :size="16" weight="regular" aria-hidden="true" />
          <Eye v-else :size="16" weight="regular" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-muted hover:bg-panel hover:text-ink"
          :aria-label="`Copy ${label}`"
          @click="copyText(value, label)"
        >
          <Copy :size="16" weight="regular" aria-hidden="true" />
        </button>
      </div>
    </div>
  </UiField>
</template>
