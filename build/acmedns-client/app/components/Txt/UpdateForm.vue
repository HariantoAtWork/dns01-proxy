<script setup lang="ts">
const { serverUrl, username, password, subdomain } = defineProps<{
  serverUrl: string
  username: string
  password: string
  subdomain: string
}>()

const txt = ref('')
const pending = ref(false)
const toasts = useToasts()

async function publish() {
  const value = txt.value.trim()
  if (!value) {
    toasts.error('TXT value is required')
    return
  }

  pending.value = true
  try {
    await $fetch('/api/acmedns/update', {
      method: 'POST',
      body: {
        serverUrl,
        username,
        password,
        subdomain,
        txt: value,
      },
    })
    toasts.ok('TXT published on acme-dns')
    txt.value = ''
  }
  catch (error) {
    toasts.error(error instanceof Error ? error.message : 'TXT update failed')
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <UiDisclosure title="Test TXT update">
    <p class="max-w-[65ch] text-sm text-muted">
      Posts to the acme-dns <span class="font-mono">/update</span> API with this account. Certbot does the same during issuance. Use it to prove the stored username and password still work.
    </p>
    <form class="flex flex-col gap-2" @submit.prevent="publish">
      <UiField label="TXT value" for="txt-value">
        <UiInput
          id="txt-value"
          v-model="txt"
          mono
          autocomplete="off"
          spellcheck="false"
        />
      </UiField>
      <UiButton type="submit" class="self-start" :disabled="pending">
        {{ pending ? 'Publishing' : 'Publish TXT' }}
      </UiButton>
    </form>
  </UiDisclosure>
</template>
