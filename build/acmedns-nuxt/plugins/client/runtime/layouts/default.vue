<script setup lang="ts">
useHead({
  titleTemplate: (title?: string) => title ? `${title} · ACME DNS` : 'ACME DNS',
})

const navOpen = ref(false)
const route = useRoute()

watch(() => route.fullPath, () => {
  navOpen.value = false
})
</script>

<template>
  <div class="flex min-h-[100dvh] text-ink">
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-[40] focus:bg-signal focus:px-3 focus:py-2 focus:text-signal-ink"
    >
      Skip to content
    </a>

    <UiAppSidebar v-model:open="navOpen" />

    <div class="flex min-w-0 flex-1 flex-col">
      <UiAppNav @toggle-nav="navOpen = !navOpen" />
      <main id="main" class="mx-auto w-full max-w-[1200px] flex-1 px-3 py-4 md:px-6 md:py-8">
        <UiBreadcrumbs class="mb-4 md:mb-6" />
        <slot />
      </main>
    </div>

    <RegisterModal />
    <UiToastStack />
  </div>
</template>
