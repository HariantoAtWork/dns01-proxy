<script setup lang="ts">
import { PhEye as Eye, PhEyeSlash as EyeSlash } from '@phosphor-icons/vue'

const {
  id,
  invalid = false,
  autocomplete = 'current-password',
  name = 'password',
} = defineProps<{
  id?: string
  invalid?: boolean
  autocomplete?: string
  name?: string
}>()

const model = defineModel<string>({ default: '' })
const revealed = ref(false)
const generatedId = useId()
const inputId = computed(() => id || generatedId)
</script>

<template>
  <div
    class="ui-input-shell relative flex items-center border bg-paper"
    :class="invalid ? 'border-danger' : 'border-rule'"
    style="border-radius: var(--radius-input)"
  >
    <input
      :id="inputId"
      v-model="model"
      class="ui-input min-w-0 w-full border-0 bg-transparent px-3 py-2 pr-10 font-mono text-sm text-ink outline-none"
      :type="revealed ? 'text' : 'password'"
      :autocomplete
      :name
      spellcheck="false"
      :aria-invalid="invalid || undefined"
    >
    <button
      type="button"
      class="absolute inset-y-0 right-0 my-auto mr-1 inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-muted hover:bg-panel hover:text-ink"
      :aria-pressed="revealed"
      :aria-label="revealed ? 'Hide password' : 'Show password'"
      @click="revealed = !revealed"
    >
      <EyeSlash v-if="revealed" :size="16" weight="regular" aria-hidden="true" />
      <Eye v-else :size="16" weight="regular" aria-hidden="true" />
    </button>
  </div>
</template>
