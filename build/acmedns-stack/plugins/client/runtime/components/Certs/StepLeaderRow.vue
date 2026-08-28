<script setup lang="ts">
const { label, status, statusClass } = defineProps<{
  label: string
  status: string
  statusClass?: string
}>()
</script>

<template>
  <div class="flex min-w-0 items-baseline gap-2">
    <span class="shrink-0" :class="statusClass">
      {{ label }}
    </span>
    <span
      class="mb-0.5 min-w-4 flex-1 border-b border-rule/40"
      aria-hidden="true"
    />
    <span
      class="shrink-0 uppercase tracking-wide"
      :class="statusClass"
    >
      {{ status }}
    </span>
  </div>
</template>
