<script setup lang="ts">
import { ADMIN_USERNAME } from '#shared/types/auth'
import { safeRedirectPath } from '#shared/utils/safeRedirect'

definePageMeta({ layout: 'login' })
useHead({ title: 'Sign in' })

const route = useRoute()
const { login } = useAuth()

const username = ref(ADMIN_USERNAME)
const password = ref('')
const error = ref('')
const pending = ref(false)
const usernameId = useId()
const passwordId = useId()

function errorMessage(caught: unknown) {
  if (caught && typeof caught === 'object' && 'data' in caught) {
    const data = (caught as { data?: { message?: string } }).data
    if (data?.message) {
      return data.message
    }
  }
  return 'Wrong username or password'
}

async function submit() {
  error.value = ''
  pending.value = true
  try {
    await login(username.value, password.value)
    await navigateTo(safeRedirectPath(route.query.redirect))
  }
  catch (caught) {
    error.value = errorMessage(caught)
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <section class="border border-rule bg-panel p-6 shadow-[0_12px_32px_var(--shadow)]" style="border-radius: var(--radius-panel)">
    <p class="font-mono text-xs tracking-[0.18em] text-signal uppercase">Restricted access</p>
    <h1 class="mt-2 text-2xl font-semibold tracking-tight">Sign in</h1>
    <p class="mt-2 text-sm text-muted">
      This console is locked. The username is always
      <span class="font-mono text-ink">{{ ADMIN_USERNAME }}</span>.
    </p>

    <form class="mt-6 flex flex-col gap-4" @submit.prevent="submit">
      <div class="flex flex-col gap-2">
        <label :for="usernameId" class="text-sm font-medium">Username</label>
        <input
          :id="usernameId"
          v-model="username"
          class="border border-rule bg-paper px-3 py-2 font-mono text-sm"
          style="border-radius: var(--radius-input)"
          autocomplete="username"
          spellcheck="false"
          name="username"
        >
      </div>
      <div class="flex flex-col gap-2">
        <label :for="passwordId" class="text-sm font-medium">Password</label>
        <input
          :id="passwordId"
          v-model="password"
          type="password"
          class="border bg-paper px-3 py-2 font-mono text-sm"
          :class="error ? 'border-danger' : 'border-rule'"
          style="border-radius: var(--radius-input)"
          autocomplete="current-password"
          name="password"
          :aria-invalid="Boolean(error)"
        >
      </div>
      <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
      <button
        type="submit"
        class="rounded-[6px] bg-signal px-4 py-2 text-sm text-signal-ink disabled:opacity-50 hover:brightness-105 active:scale-[0.98]"
        :disabled="pending"
      >
        {{ pending ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>
  </section>
</template>
