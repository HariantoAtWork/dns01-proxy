<script setup lang="ts">
import { PhQuestion as Question, PhPlus as Plus, PhHouse as House, PhSignOut as SignOut, PhArchive as Archive } from '@phosphor-icons/vue'

const route = useRoute()
const { restrictMode, authenticated, logout } = useAuth()

const links = [
  { to: '/', label: 'Home', icon: House, exact: true },
  { to: '/register', label: 'Register', icon: Plus, exact: false },
  { to: '/backup', label: 'Backup', icon: Archive, exact: false },
  { to: '/help', label: 'Help', icon: Question, exact: false },
] as const

const signingOut = ref(false)

async function signOut() {
  if (signingOut.value) {
    return
  }
  signingOut.value = true
  try {
    await logout()
  }
  finally {
    signingOut.value = false
  }
}
</script>

<template>
  <header class="sticky top-0 z-[10] border-b border-rule bg-paper/90 backdrop-blur-md">
    <div class="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 md:px-6">
      <NuxtLink to="/" class="flex items-baseline gap-2 text-ink no-underline">
        <span class="font-semibold tracking-tight">ACME DNS</span>
        <span class="hidden text-sm text-muted sm:inline">client storage</span>
      </NuxtLink>
      <div class="flex items-center gap-2">
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
          <NetworkPublicIps />
        </nav>
        <div
          v-if="restrictMode && authenticated"
          class="ml-1 flex items-center gap-2 border-l border-rule pl-3"
        >
          <span class="hidden font-mono text-xs text-muted sm:inline">signed in as admin</span>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-[6px] px-3 py-2 text-sm text-muted transition-colors hover:bg-panel hover:text-ink"
            :disabled="signingOut"
            @click="signOut"
          >
            <SignOut :size="16" weight="regular" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  </header>
</template>
