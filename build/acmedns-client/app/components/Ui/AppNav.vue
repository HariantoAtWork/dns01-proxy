<script setup lang="ts">
import {
  PhQuestion as Question,
  PhPlus as Plus,
  PhHouse as House,
  PhSignOut as SignOut,
  PhSignIn as SignIn,
  PhArchive as Archive,
  PhCertificate as Certificate,
  PhList as List,
  PhUser as User,
  PhCaretDown as CaretDown,
} from '@phosphor-icons/vue'
import { ADMIN_USERNAME } from '#shared/types/auth'

const route = useRoute()
const { restrictMode, authenticated, logout } = useAuth()

const links = [
  { to: '/', label: 'Home', icon: House, exact: true },
  { to: '/register', label: 'Register', icon: Plus, exact: false },
  { to: '/certs', label: 'Certs', icon: Certificate, exact: false },
  { to: '/backup', label: 'Backup', icon: Archive, exact: false },
  { to: '/help', label: 'Help', icon: Question, exact: false },
] as const

const navOpen = ref(false)
const accountOpen = ref(false)
const signingOut = ref(false)
const navTriggerId = useId()
const accountTriggerId = useId()

watch(() => route.fullPath, () => {
  navOpen.value = false
  accountOpen.value = false
})

function isActive(link: (typeof links)[number]) {
  return link.exact ? route.path === link.to : route.path.startsWith(link.to)
}

async function signOut() {
  if (signingOut.value) {
    return
  }
  signingOut.value = true
  accountOpen.value = false
  try {
    await logout()
  }
  finally {
    signingOut.value = false
  }
}

function openNav(toggle: () => void) {
  accountOpen.value = false
  toggle()
}

function openAccount(toggle: () => void) {
  navOpen.value = false
  toggle()
}
</script>

<template>
  <header class="sticky top-0 z-[20] border-b border-rule bg-paper/90 backdrop-blur-md">
    <div class="mx-auto flex h-10 max-w-[1200px] items-center justify-between gap-2 px-1 md:h-16 md:gap-3 md:px-6">
      <NuxtLink to="/" class="flex min-w-0 items-baseline gap-2 text-ink no-underline">
        <span class="text-sm font-semibold tracking-tight md:text-base">ACME DNS</span>
        <span class="hidden text-sm text-muted sm:inline">client storage</span>
      </NuxtLink>

      <div class="flex items-center gap-0.5 sm:gap-2">
        <!-- Desktop primary nav -->
        <nav aria-label="Primary" class="hidden items-center gap-1 md:flex">
          <NuxtLink
            v-for="link in links"
            :key="link.to"
            :to="link.to"
            class="inline-flex items-center gap-2 rounded-[6px] px-3 py-2 text-sm text-muted no-underline transition-colors hover:bg-panel hover:text-ink"
            :class="isActive(link) && 'bg-panel text-ink'"
          >
            <component :is="link.icon" :size="16" weight="regular" aria-hidden="true" />
            {{ link.label }}
          </NuxtLink>
          <NetworkPublicIps />
        </nav>

        <!-- Mobile: menu + internet + account -->
        <div class="flex items-center gap-0.5 md:hidden">
          <NetworkPublicIps />

          <UiMenu v-model:open="navOpen" align="right">
            <template #trigger="{ open, toggle, panelId }">
              <button
                :id="navTriggerId"
                type="button"
                class="inline-flex items-center gap-1 rounded-[6px] px-2 py-1.5 text-sm text-muted transition-colors hover:bg-panel hover:text-ink"
                :class="open && 'bg-panel text-ink'"
                :aria-expanded="open"
                aria-haspopup="menu"
                :aria-controls="panelId"
                aria-label="Open navigation menu"
                @click="openNav(toggle)"
              >
                <List :size="16" weight="regular" aria-hidden="true" />
                <span class="text-sm">Menu</span>
                <CaretDown
                  :size="12"
                  weight="bold"
                  class="text-muted transition-transform"
                  :class="open && 'rotate-180'"
                  aria-hidden="true"
                />
              </button>
            </template>
            <template #default="{ close }">
              <NuxtLink
                v-for="link in links"
                :key="link.to"
                :to="link.to"
                role="menuitem"
                class="flex items-center gap-2 px-3 py-2.5 text-sm text-muted no-underline hover:bg-paper hover:text-ink"
                :class="isActive(link) && 'bg-paper text-ink'"
                @click="close()"
              >
                <component :is="link.icon" :size="16" weight="regular" aria-hidden="true" />
                {{ link.label }}
              </NuxtLink>
            </template>
          </UiMenu>
        </div>

        <!-- Account pulldown (mobile + desktop when restrict mode) -->
        <UiMenu
          v-if="restrictMode"
          v-model:open="accountOpen"
          align="right"
        >
          <template #trigger="{ open, toggle, panelId }">
            <button
              :id="accountTriggerId"
              type="button"
              class="inline-flex items-center gap-1 rounded-[6px] px-2 py-1.5 text-sm text-muted transition-colors hover:bg-panel hover:text-ink md:gap-1.5 md:px-2.5 md:py-2"
              :class="open && 'bg-panel text-ink'"
              :aria-expanded="open"
              aria-haspopup="menu"
              :aria-controls="panelId"
              aria-label="Account menu"
              @click="openAccount(toggle)"
            >
              <User :size="16" weight="regular" class="md:hidden" aria-hidden="true" />
              <User :size="18" weight="regular" class="hidden md:inline" aria-hidden="true" />
              <span class="hidden sm:inline">Account</span>
              <CaretDown
                :size="12"
                weight="bold"
                class="text-muted transition-transform"
                :class="open && 'rotate-180'"
                aria-hidden="true"
              />
            </button>
          </template>
          <template #default="{ close }">
            <div class="border-b border-rule px-3 py-2.5" role="none">
              <p class="text-xs uppercase tracking-wide text-muted">Signed in as</p>
              <p class="mt-0.5 font-mono text-sm text-ink">
                {{ authenticated ? ADMIN_USERNAME : '—' }}
              </p>
            </div>
            <button
              v-if="authenticated"
              type="button"
              role="menuitem"
              class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-muted hover:bg-paper hover:text-ink"
              :disabled="signingOut"
              @click="signOut"
            >
              <SignOut :size="16" weight="regular" aria-hidden="true" />
              {{ signingOut ? 'Signing out…' : 'Sign out' }}
            </button>
            <NuxtLink
              v-else
              to="/login"
              role="menuitem"
              class="flex items-center gap-2 px-3 py-2.5 text-sm text-muted no-underline hover:bg-paper hover:text-ink"
              @click="close()"
            >
              <SignIn :size="16" weight="regular" aria-hidden="true" />
              Sign in
            </NuxtLink>
          </template>
        </UiMenu>
      </div>
    </div>
  </header>
</template>
