<script setup lang="ts">
const {
  mono = false,
  invalid = false,
  type = 'text',
  disabled = false,
} = defineProps<{
  mono?: boolean
  invalid?: boolean
  type?: string
  disabled?: boolean
}>()

const model = defineModel<string>({ default: '' })
</script>

<template>
  <input
    v-model="model"
    :type
    :disabled
    class="ui-input w-full border bg-paper px-3 py-2 text-sm text-ink disabled:opacity-50"
    :class="[
      mono && 'font-mono',
      invalid ? 'border-danger' : 'border-rule',
    ]"
    style="border-radius: var(--radius-input)"
    :aria-invalid="invalid || undefined"
  >
</template>
