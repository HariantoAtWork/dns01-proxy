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
  <UiPanel class="shadow-[0_12px_32px_var(--shadow)]">
    <p class="font-mono text-xs tracking-[0.18em] text-signal uppercase">Restricted access</p>
    <h1 class="mt-2 text-2xl font-semibold tracking-tight">Sign in</h1>
    <p class="mt-2 text-sm text-muted">
      This console is locked. The username is always
      <span class="font-mono text-ink">{{ ADMIN_USERNAME }}</span>.
    </p>

    <form class="mt-6 flex flex-col gap-4" @submit.prevent="submit">
      <UiField label="Username" :for="usernameId">
        <UiInput
          :id="usernameId"
          v-model="username"
          mono
          autocomplete="username"
          name="username"
          spellcheck="false"
        />
      </UiField>
      <UiField label="Password" :for="passwordId" :error="error">
        <UiPasswordInput
          :id="passwordId"
          v-model="password"
          :invalid="Boolean(error)"
          autocomplete="current-password"
          name="password"
        />
      </UiField>
      <UiButton type="submit" :disabled="pending">
        {{ pending ? 'Signing in…' : 'Sign in' }}
      </UiButton>
    </form>
  </UiPanel>
</template>
