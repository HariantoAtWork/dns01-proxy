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
    <NuxtLink
      :to
      class="mt-6 inline-flex rounded-[6px] bg-signal px-4 py-2 text-sm text-signal-ink no-underline hover:brightness-105 active:scale-[0.98]"
    >
      {{ actionLabel }}
    </NuxtLink>
  </div>
</template>
