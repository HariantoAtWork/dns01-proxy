<script setup lang="ts">
useHead({
  titleTemplate: (title?: string) => title ? `${title} · ACME DNS` : 'ACME DNS',
})
</script>

<template>
  <div class="min-h-[100dvh] text-ink">
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-[40] focus:bg-signal focus:px-3 focus:py-2 focus:text-signal-ink"
    >
      Skip to content
    </a>
    <UiAppNav />
    <main id="main" class="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6 md:py-8">
      <slot />
    </main>
    <UiToastStack />
  </div>
</template>
