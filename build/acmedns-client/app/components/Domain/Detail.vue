<script setup lang="ts">
import { PhCheckCircle as CheckCircle, PhTrash as Trash } from '@phosphor-icons/vue'
import type { DomainEntry } from '#shared/types/clientstorage'

const { entry } = defineProps<{
  entry: DomainEntry
}>()

const emit = defineEmits<{
  deleted: []
}>()

const toasts = useToasts()
const { deleteDomain } = useClientStorage()
const { status, attempts, totalAttempts, message, start, cancel, reset } = useDnsValidation()
const confirmOpen = ref(false)

watch(() => entry.domain, () => {
  reset()
})

async function remove() {
  try {
    const result = await deleteDomain(entry.domain)
    toasts.ok(result.message)
    emit('deleted')
  }
  catch (error) {
    toasts.error(error instanceof Error ? error.message : 'Failed to delete domain')
  }
}

function validate() {
  start(entry.domain, entry.details.fulldomain)
}

watch(status, (value) => {
  if (value === 'ok') {
    toasts.ok('DNS record validated successfully')
  }
  if (value === 'timeout' || value === 'error') {
    toasts.error(message.value)
  }
})
</script>

<template>
  <article class="flex flex-col gap-5">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">{{ entry.domain }}</h1>
        <p class="mt-1 font-mono text-sm text-muted">{{ entry.details.server_url }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-[6px] bg-signal px-3 py-2 text-sm text-signal-ink active:scale-[0.98]"
          @click="validate"
        >
          <CheckCircle :size="16" weight="regular" />
          Validate CNAME
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-[6px] border border-danger px-3 py-2 text-sm text-danger hover:bg-panel"
          @click="confirmOpen = true"
        >
          <Trash :size="16" weight="regular" />
          Delete
        </button>
      </div>
    </header>

    <CnameRecipe :domain="entry.domain" :fulldomain="entry.details.fulldomain" />

    <DnsProgress
      v-if="status === 'running'"
      :status
      :attempts
      :total-attempts="totalAttempts"
      :message
      @cancel="cancel()"
    />

    <p
      v-else-if="status === 'ok'"
      class="text-sm text-ink"
    >
      {{ message }}
    </p>

    <section class="flex flex-col gap-4">
      <h2 class="text-base font-semibold">Account secrets</h2>
      <p class="max-w-[65ch] text-sm text-muted">
        Hidden until you reveal them. Copy only what you need. These cannot be recovered from acme-dns if you lose this file.
      </p>
      <UiSecretField label="Username" :value="entry.details.username" />
      <UiSecretField label="Password" :value="entry.details.password" />
      <UiSecretField label="Subdomain" :value="entry.details.subdomain" :secret="false" />
      <UiSecretField label="Full domain" :value="entry.details.fulldomain" :secret="false" hint="CNAME target" />
    </section>

    <TxtUpdateForm
      :server-url="entry.details.server_url"
      :username="entry.details.username"
      :password="entry.details.password"
      :subdomain="entry.details.subdomain"
    />

    <UiConfirmDialog
      v-model:open="confirmOpen"
      title="Delete this domain?"
      confirm-label="Delete"
      cancel-label="Keep"
      danger
      @confirm="remove"
    >
      Remove {{ entry.domain }} from clientstorage.json. The acme-dns account itself is not deleted.
    </UiConfirmDialog>
  </article>
</template>
