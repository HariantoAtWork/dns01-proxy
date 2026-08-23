<script setup lang="ts">
import { isValidDomain, isValidHttpUrl } from '#client/utils/domain'

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
    <UiField label="Domain" for="domain" :error="domainError">
      <UiInput
        id="domain"
        v-model="domain"
        :invalid="Boolean(domainError)"
        placeholder="example.com"
        autocomplete="off"
        spellcheck="false"
      />
    </UiField>
    <UiField label="Server URL" for="server" :error="serverError">
      <UiInput
        id="server"
        v-model="server"
        mono
        :invalid="Boolean(serverError)"
        placeholder="http://acmedns-server"
        autocomplete="off"
        spellcheck="false"
      />
    </UiField>
    <UiButton type="submit" :disabled="pending">
      {{ pending ? 'Registering' : 'Register' }}
    </UiButton>
  </form>
</template>
