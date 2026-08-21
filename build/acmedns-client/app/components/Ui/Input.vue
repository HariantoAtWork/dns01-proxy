<script setup lang="ts">
const {
  mono = false,
  invalid = false,
  type = 'text',
} = defineProps<{
  mono?: boolean
  invalid?: boolean
  type?: string
}>()

const model = defineModel<string>({ default: '' })
</script>

<template>
  <input
    v-model="model"
    :type
    class="ui-input w-full border bg-paper px-3 py-2 text-sm text-ink"
    :class="[
      mono && 'font-mono',
      invalid ? 'border-danger' : 'border-rule',
    ]"
    style="border-radius: var(--radius-input)"
    :aria-invalid="invalid || undefined"
  >
</template>
