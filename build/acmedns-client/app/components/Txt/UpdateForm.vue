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
  <details class="border border-rule bg-panel p-4" style="border-radius: var(--radius-panel)">
    <summary class="cursor-pointer font-medium">Test TXT update</summary>
    <p class="mt-2 max-w-[65ch] text-sm text-muted">
      Posts to the acme-dns <span class="font-mono">/update</span> API with this account. Certbot does the same during issuance. Use it to prove the stored username and password still work.
    </p>
    <form class="mt-4 flex flex-col gap-2" @submit.prevent="publish">
      <label for="txt-value" class="text-sm font-medium">TXT value</label>
      <input
        id="txt-value"
        v-model="txt"
        class="border border-rule bg-paper px-3 py-2 font-mono text-sm"
        style="border-radius: var(--radius-input)"
        autocomplete="off"
        spellcheck="false"
      >
      <button
        type="submit"
        class="self-start rounded-[6px] bg-signal px-3 py-2 text-sm text-signal-ink disabled:opacity-50"
        :disabled="pending"
      >
        {{ pending ? 'Publishing' : 'Publish TXT' }}
      </button>
    </form>
  </details>
</template>
