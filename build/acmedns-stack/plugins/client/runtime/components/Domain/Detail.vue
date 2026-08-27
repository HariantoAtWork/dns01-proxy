<script setup lang="ts">
import {
  PhCheckCircle as CheckCircle,
  PhTrash as Trash,
  PhArchive as Archive,
} from '@phosphor-icons/vue'
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
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold tracking-tight">{{ entry.domain }}</h1>
        <p class="mt-1 font-mono text-sm text-muted">{{ entry.details.server_url }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UiButton @click="validate">
          <CheckCircle :size="16" weight="regular" />
          Validate CNAME
        </UiButton>
        <UiButton
          variant="ghost"
          :to="`/backup?domain=${encodeURIComponent(entry.domain)}`"
        >
          <Archive :size="16" weight="regular" />
          Backup
        </UiButton>
        <UiButton variant="danger" @click="confirmOpen = true">
          <Trash :size="16" weight="regular" />
          Delete
        </UiButton>
      </div>
    </header>

    <CnameRecipe compact :domain="entry.domain" :fulldomain="entry.details.fulldomain" />

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

    <DomainSecrets :details="entry.details" />

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
