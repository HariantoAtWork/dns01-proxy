<script setup lang="ts">
import type { Component } from 'vue'
import {
  PhHouse as House,
  PhGlobe as Globe,
  PhCertificate as Certificate,
  PhFlask as Flask,
  PhFloppyDisk as FloppyDisk,
  PhGear as Gear,
  PhQuestion as Question,
  PhPlus as Plus,
  PhX as Close,
  PhSwap as Swap,
  PhListChecks as ListChecks,
  PhSquaresFour as SquaresFour,
} from '@phosphor-icons/vue'

type NavChild = {
  to: string
  label: string
  icon: Component
  exact: boolean
}

type NavLink = {
  to: string
  label: string
  icon: Component
  exact: boolean
  registerAction: boolean
  children?: NavChild[]
}

const open = defineModel<boolean>('open', { default: false })

const route = useRoute()
const { sharedMode } = useSharedMode()
const { show: showRegister } = useRegisterModal()

const links = computed<NavLink[]>(() => {
  const items: NavLink[] = [
    { to: '/', label: 'Home', icon: House, exact: true, registerAction: false },
    {
      to: '/domains',
      label: sharedMode.value ? 'DNS setup' : 'Domains',
      icon: Globe,
      exact: true,
      registerAction: !sharedMode.value,
    },
    ...(sharedMode.value
      ? []
      : [{ to: '/backup', label: 'Backup', icon: FloppyDisk, exact: true, registerAction: false }]),
    { to: '/certs', label: 'Certificates', icon: Certificate, exact: false, registerAction: false },
    { to: '/lab', label: 'DNS-01 Lab', icon: Flask, exact: false, registerAction: false },
    {
      to: '/proxy',
      label: 'Proxy',
      icon: Swap,
      exact: false,
      registerAction: false,
      children: [
        { to: '/proxy', label: 'Overview', icon: SquaresFour, exact: true },
        { to: '/proxy/hosts', label: 'Hosts', icon: Swap, exact: true },
        { to: '/proxy/access-lists', label: 'Access Lists', icon: ListChecks, exact: true },
      ],
    },
    { to: '/settings', label: 'Settings', icon: Gear, exact: true, registerAction: false },
    { to: '/help', label: 'Help', icon: Question, exact: false, registerAction: false },
  ]
  return items
})

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

function isActive(link: { to: string, exact: boolean }) {
  return link.exact ? route.path === link.to : route.path.startsWith(link.to)
}

function openRegister() {
  open.value = false
  showRegister()
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
      <template
        v-for="link in links"
        :key="link.to"
      >
        <div
          class="group flex items-center gap-0.5 rounded-[6px] transition-colors hover:bg-paper"
          :class="isActive(link) && !link.children && 'bg-paper'"
        >
          <NuxtLink
            :to="link.to"
            class="inline-flex min-w-0 flex-1 items-center gap-2 rounded-[6px] px-3 py-2 text-sm text-muted no-underline transition-colors hover:text-ink"
            :class="isActive(link) && 'text-ink'"
          >
            <component
              :is="link.icon"
              :size="16"
              weight="regular"
              aria-hidden="true"
            />
            <span class="truncate">{{ link.label }}</span>
          </NuxtLink>
          <button
            v-if="link.registerAction"
            type="button"
            class="mr-1 inline-flex shrink-0 rounded-[6px] p-1.5 text-muted transition-colors hover:bg-panel hover:text-ink"
            aria-haspopup="dialog"
            aria-label="Register domain"
            @click="openRegister"
          >
            <Plus
              :size="14"
              weight="bold"
              aria-hidden="true"
            />
          </button>
        </div>

        <div
          v-if="link.children"
          class="mb-1 ml-3 flex flex-col gap-0.5 border-l border-rule pl-2"
          aria-label="Proxy sections"
        >
          <NuxtLink
            v-for="child in link.children"
            :key="child.to"
            :to="child.to"
            class="inline-flex items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-sm text-muted no-underline transition-colors hover:bg-paper hover:text-ink"
            :class="isActive(child) && 'bg-paper text-ink'"
          >
            <component
              :is="child.icon"
              :size="14"
              weight="regular"
              aria-hidden="true"
            />
            <span class="truncate">{{ child.label }}</span>
          </NuxtLink>
        </div>
      </template>
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
          <p class="text-sm font-semibold tracking-tight">
            ACME DNS
          </p>
          <button
            type="button"
            class="inline-flex rounded-[6px] p-2 text-muted hover:bg-panel hover:text-ink"
            aria-label="Close navigation"
            @click="open = false"
          >
            <Close
              :size="16"
              weight="regular"
              aria-hidden="true"
            />
          </button>
        </div>
        <nav class="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          <template
            v-for="link in links"
            :key="`m-${link.to}`"
          >
            <div
              class="flex items-center gap-0.5 rounded-[6px] hover:bg-panel"
              :class="isActive(link) && !link.children && 'bg-panel'"
            >
              <NuxtLink
                :to="link.to"
                class="inline-flex min-w-0 flex-1 items-center gap-2 rounded-[6px] px-3 py-2.5 text-sm text-muted no-underline hover:text-ink"
                :class="isActive(link) && 'text-ink'"
                @click="open = false"
              >
                <component
                  :is="link.icon"
                  :size="16"
                  weight="regular"
                  aria-hidden="true"
                />
                <span class="truncate">{{ link.label }}</span>
              </NuxtLink>
              <button
                v-if="link.registerAction"
                type="button"
                class="mr-1 inline-flex shrink-0 rounded-[6px] p-1.5 text-muted hover:bg-paper hover:text-ink"
                aria-haspopup="dialog"
                aria-label="Register domain"
                @click="openRegister"
              >
                <Plus
                  :size="14"
                  weight="bold"
                  aria-hidden="true"
                />
              </button>
            </div>

            <div
              v-if="link.children"
              class="mb-1 ml-3 flex flex-col gap-0.5 border-l border-rule pl-2"
              aria-label="Proxy sections"
            >
              <NuxtLink
                v-for="child in link.children"
                :key="`m-${child.to}`"
                :to="child.to"
                class="inline-flex items-center gap-2 rounded-[6px] px-2.5 py-2 text-sm text-muted no-underline hover:bg-panel hover:text-ink"
                :class="isActive(child) && 'bg-panel text-ink'"
                @click="open = false"
              >
                <component
                  :is="child.icon"
                  :size="14"
                  weight="regular"
                  aria-hidden="true"
                />
                <span class="truncate">{{ child.label }}</span>
              </NuxtLink>
            </div>
          </template>
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
