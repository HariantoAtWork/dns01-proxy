<script setup lang="ts">
import {
  PhHouse as House,
  PhCertificate as Certificate,
  PhQuestion as Question,
  PhX as Close,
} from '@phosphor-icons/vue'

const open = defineModel<boolean>('open', { default: false })

const route = useRoute()

const links = [
  { to: '/', label: 'Home', icon: House, exact: true },
  { to: '/certs', label: 'Certificates', icon: Certificate, exact: false },
  { to: '/help', label: 'Help', icon: Question, exact: false },
] as const

watch(() => route.fullPath, () => {
  open.value = false
})

watch(open, (value) => {
  if (!import.meta.client) {
    return
  }
  document.body.style.overflow = value ? 'hidden' : ''
})

onBeforeUnmount(() => {
  if (import.meta.client) {
    document.body.style.overflow = ''
  }
})

function isActive(link: (typeof links)[number]) {
  return link.exact ? route.path === link.to : route.path.startsWith(link.to)
}
</script>

<template>
  <!-- Desktop sidebar -->
  <aside
    class="hidden w-56 shrink-0 flex-col border-r border-rule bg-panel/70 md:flex"
    aria-label="Primary"
  >
    <div class="flex h-16 items-center border-b border-rule px-4">
      <NuxtLink to="/" class="min-w-0 text-ink no-underline">
        <span class="text-base font-semibold tracking-tight">ACME DNS</span>
      </NuxtLink>
    </div>
    <nav class="flex flex-1 flex-col gap-1 p-3">
      <NuxtLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        class="inline-flex items-center gap-2 rounded-[6px] px-3 py-2 text-sm text-muted no-underline transition-colors hover:bg-paper hover:text-ink"
        :class="isActive(link) && 'bg-paper text-ink'"
      >
        <component :is="link.icon" :size="16" weight="regular" aria-hidden="true" />
        {{ link.label }}
      </NuxtLink>
    </nav>
  </aside>

  <!-- Mobile drawer -->
  <Teleport to="body">
    <Transition name="shell-backdrop">
      <button
        v-if="open"
        type="button"
        class="fixed inset-0 z-[24] bg-ink/45 md:hidden"
        aria-label="Close navigation"
        @click="open = false"
      />
    </Transition>

    <Transition name="shell-drawer">
      <aside
        v-if="open"
        id="app-sidebar-mobile"
        class="fixed inset-y-0 left-0 z-[25] flex w-[min(18rem,88vw)] flex-col border-r border-rule bg-paper shadow-[0_16px_40px_var(--shadow)] md:hidden"
        aria-label="Primary"
      >
        <div class="flex h-12 items-center justify-between border-b border-rule px-3">
          <p class="text-sm font-semibold tracking-tight">ACME DNS</p>
          <button
            type="button"
            class="inline-flex rounded-[6px] p-2 text-muted hover:bg-panel hover:text-ink"
            aria-label="Close navigation"
            @click="open = false"
          >
            <Close :size="16" weight="regular" aria-hidden="true" />
          </button>
        </div>
        <nav class="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          <NuxtLink
            v-for="link in links"
            :key="link.to"
            :to="link.to"
            class="inline-flex items-center gap-2 rounded-[6px] px-3 py-2.5 text-sm text-muted no-underline hover:bg-panel hover:text-ink"
            :class="isActive(link) && 'bg-panel text-ink'"
            @click="open = false"
          >
            <component :is="link.icon" :size="16" weight="regular" aria-hidden="true" />
            {{ link.label }}
          </NuxtLink>
        </nav>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.shell-backdrop-enter-active,
.shell-backdrop-leave-active {
  transition: opacity 0.22s ease;
}

.shell-backdrop-enter-from,
.shell-backdrop-leave-to {
  opacity: 0;
}

.shell-drawer-enter-active,
.shell-drawer-leave-active {
  transition: transform 0.28s ease;
}

.shell-drawer-enter-from,
.shell-drawer-leave-to {
  transform: translateX(-100%);
}
</style>
