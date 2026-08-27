<script setup lang="ts">
const {
  label,
  hint,
  error,
  for: forId,
} = defineProps<{
  label: string
  hint?: string
  error?: string
  for?: string
}>()

const generatedId = useId()
const fieldId = computed(() => forId || generatedId)
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-baseline justify-between gap-3">
      <label :for="fieldId" class="text-sm font-medium text-ink">{{ label }}</label>
      <span v-if="hint" class="text-xs text-muted">{{ hint }}</span>
    </div>
    <slot :id="fieldId" />
    <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
  </div>
</template>
