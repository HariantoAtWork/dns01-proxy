<script setup lang="ts">
import { isValidDomain, isValidHttpUrl } from '~/utils/domain'

const domain = defineModel<string>('domain', { required: true })
const server = defineModel<string>('server', { required: true })
const { pending = false, submitted = false } = defineProps<{
  pending?: boolean
  submitted?: boolean
}>()

const emit = defineEmits<{
  submit: []
}>()

const domainError = computed(() => {
  if (!submitted) {
    return ''
  }
  if (!domain.value.trim()) {
    return 'Domain is required'
  }
  if (!isValidDomain(domain.value)) {
    return 'Invalid domain format'
  }
  return ''
})

const serverError = computed(() => {
  if (!submitted) {
    return ''
  }
  if (!server.value.trim()) {
    return 'Server URL is required'
  }
  if (!isValidHttpUrl(server.value)) {
    return 'Invalid URL format'
  }
  return ''
})
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="emit('submit')">
    <div class="flex flex-col gap-2">
      <label for="domain" class="text-sm font-medium">Domain</label>
      <input
        id="domain"
        v-model="domain"
        class="border bg-paper px-3 py-2 text-sm"
        :class="domainError ? 'border-danger' : 'border-rule'"
        style="border-radius: var(--radius-input)"
        placeholder="example.com"
        autocomplete="off"
        spellcheck="false"
        :aria-invalid="Boolean(domainError)"
      >
      <p v-if="domainError" class="text-sm text-danger">{{ domainError }}</p>
    </div>
    <div class="flex flex-col gap-2">
      <label for="server" class="text-sm font-medium">Server URL</label>
      <input
        id="server"
        v-model="server"
        class="border bg-paper px-3 py-2 font-mono text-sm"
        :class="serverError ? 'border-danger' : 'border-rule'"
        style="border-radius: var(--radius-input)"
        placeholder="http://acmedns-server"
        autocomplete="off"
        spellcheck="false"
        :aria-invalid="Boolean(serverError)"
      >
      <p class="text-sm text-muted">
        The Nuxt server calls this URL, so <span class="font-mono">http://acmedns-server</span> works inside Docker.
      </p>
      <p v-if="serverError" class="text-sm text-danger">{{ serverError }}</p>
    </div>
    <button
      type="submit"
      class="rounded-[6px] bg-signal px-4 py-2 text-sm text-signal-ink disabled:opacity-50 active:scale-[0.98]"
      :disabled="pending"
    >
      {{ pending ? 'Registering' : 'Register' }}
    </button>
  </form>
</template>
