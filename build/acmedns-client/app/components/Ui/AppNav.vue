<script setup lang="ts">
import { PhQuestion as Question, PhPlus as Plus, PhHouse as House } from '@phosphor-icons/vue'

const route = useRoute()

const links = [
  { to: '/', label: 'Home', icon: House, exact: true },
  { to: '/register', label: 'Register', icon: Plus, exact: false },
  { to: '/help', label: 'Help', icon: Question, exact: false },
] as const
</script>

<template>
  <header class="sticky top-0 z-[10] border-b border-rule bg-paper/90 backdrop-blur-md">
    <div class="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 md:px-6">
      <NuxtLink to="/" class="flex items-baseline gap-2 text-ink no-underline">
        <span class="font-semibold tracking-tight">ACME DNS</span>
        <span class="hidden text-sm text-muted sm:inline">client storage</span>
      </NuxtLink>
      <nav aria-label="Primary" class="flex items-center gap-1">
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="inline-flex items-center gap-2 rounded-[6px] px-3 py-2 text-sm text-muted no-underline transition-colors hover:bg-panel hover:text-ink"
          :class="(link.exact ? route.path === link.to : route.path.startsWith(link.to)) && 'bg-panel text-ink'"
        >
          <component :is="link.icon" :size="16" weight="regular" aria-hidden="true" />
          {{ link.label }}
        </NuxtLink>
      </nav>
    </div>
  </header>
</template>
