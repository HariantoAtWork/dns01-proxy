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
    <header class="border-b border-rule bg-paper/90">
      <div class="mx-auto flex h-16 max-w-[1200px] items-center gap-2 px-4 md:px-6">
        <span class="font-semibold tracking-tight">ACME DNS</span>
        <span class="text-sm text-muted">operator lock</span>
      </div>
    </header>
    <main id="main" class="mx-auto w-full max-w-[28rem] px-4 py-12 md:px-6">
      <slot />
    </main>
  </div>
</template>
