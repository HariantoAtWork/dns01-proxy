<script setup lang="ts">
const { title, actionLabel, to } = defineProps<{
  title: string
  actionLabel: string
  to: string
}>()
</script>

<template>
  <div class="border border-dashed border-rule bg-panel px-5 py-10" style="border-radius: var(--radius-panel)">
    <h2 class="text-xl font-semibold tracking-tight">{{ title }}</h2>
    <p class="mt-2 max-w-[65ch] text-muted">
      <slot />
    </p>
    <UiButton class="mt-6" :to>
      {{ actionLabel }}
    </UiButton>
  </div>
</template>
