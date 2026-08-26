<script setup lang="ts">
import {
  PhPlus as Plus,
  PhSignOut as SignOut,
  PhSignIn as SignIn,
  PhList as List,
  PhUser as User,
  PhCaretDown as CaretDown,
} from '@phosphor-icons/vue'
import { ADMIN_USERNAME } from '#shared/types/auth'

const emit = defineEmits<{
  'toggle-nav': []
}>()

const route = useRoute()
const { restrictMode, authenticated, logout } = useAuth()
const { show: showRegister } = useRegisterModal()

const accountOpen = ref(false)
const signingOut = ref(false)
const accountTriggerId = useId()

watch(() => route.fullPath, () => {
  accountOpen.value = false
})

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
</script>

<template>
  <header class="sticky top-0 z-[20] border-b border-rule bg-paper/90 backdrop-blur-md">
    <div class="flex h-12 items-center justify-between gap-2 px-3 md:h-16 md:px-6">
      <div class="flex min-w-0 items-center gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-[6px] px-2 py-1.5 text-sm text-muted transition-colors hover:bg-panel hover:text-ink md:hidden"
          aria-label="Open navigation"
          aria-controls="app-sidebar-mobile"
          @click="emit('toggle-nav')"
        >
          <List :size="16" weight="regular" aria-hidden="true" />
          <span>Menu</span>
        </button>
        <NuxtLink to="/" class="min-w-0 text-ink no-underline md:hidden">
          <span class="text-sm font-semibold tracking-tight">ACME DNS</span>
        </NuxtLink>
        <span class="hidden text-sm text-muted md:inline">client storage</span>
      </div>

      <div class="flex items-center gap-0.5 sm:gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-sm text-muted transition-colors hover:bg-panel hover:text-ink md:px-3 md:py-2"
          aria-haspopup="dialog"
          aria-label="Register domain"
          @click="showRegister()"
        >
          <Plus :size="16" weight="regular" aria-hidden="true" />
          <span class="hidden sm:inline">Register domain</span>
        </button>

        <NetworkPublicIps />

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
              @click="toggle()"
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
