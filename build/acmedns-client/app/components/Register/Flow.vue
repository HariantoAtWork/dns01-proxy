<script setup lang="ts">
import type { AcmeDnsCredentials, ClientStorageMap } from '#shared/types/clientstorage'
import { isValidDomain, isValidHttpUrl } from '~/utils/domain'

type Step = 'form' | 'cname' | 'poll' | 'save'

const config = useRuntimeConfig()
const toasts = useToasts()
const { saveDomain } = useClientStorage()
const {
  status: dnsStatus,
  attempts,
  totalAttempts,
  message: dnsMessage,
  start,
  cancel,
  reset: resetDns,
} = useDnsValidation()
const router = useRouter()

const domain = ref('')
const server = ref(config.public.defaultAcmednsUrl || 'http://acmedns-server')
const submitted = ref(false)
const pending = ref(false)
const step = ref<Step>('form')
const pendingData = ref<AcmeDnsCredentials | null>(null)
const overwriteOpen = ref(false)

async function handleSubmit() {
  submitted.value = true
  if (!isValidDomain(domain.value) || !isValidHttpUrl(server.value)) {
    return
  }

  pending.value = true
  try {
    const existing = await $fetch<ClientStorageMap>('/api/clientstorage')
    if (existing[domain.value.trim()]) {
      overwriteOpen.value = true
      return
    }
    await registerAccount()
  }
  catch {
    toasts.error('Failed to check domain existence')
  }
  finally {
    pending.value = false
  }
}

async function registerAccount() {
  pending.value = true
  overwriteOpen.value = false
  try {
    pendingData.value = await $fetch<AcmeDnsCredentials>('/api/acmedns/register', {
      method: 'POST',
      body: { serverUrl: server.value.trim() },
    })
    step.value = 'cname'
  }
  catch (error) {
    toasts.error(error instanceof Error ? error.message : 'Registration failed')
  }
  finally {
    pending.value = false
  }
}

function startValidation() {
  if (!pendingData.value) {
    return
  }
  step.value = 'poll'
  start(domain.value.trim(), pendingData.value.fulldomain)
}

function skipValidation() {
  cancel()
  step.value = 'save'
}

function cancelValidation() {
  cancel()
  step.value = 'save'
}

watch(dnsStatus, (value) => {
  if (step.value !== 'poll') {
    return
  }
  if (value === 'ok') {
    toasts.ok('DNS record validated', 'Success')
    step.value = 'save'
  }
  if (value === 'timeout' || value === 'error') {
    toasts.error(dnsMessage.value)
    step.value = 'save'
  }
})

async function persist(shouldSave: boolean) {
  if (!shouldSave || !pendingData.value) {
    reset()
    return
  }

  try {
    await saveDomain(domain.value.trim(), pendingData.value, true)
    toasts.ok('Domain registered successfully')
    const saved = domain.value.trim()
    reset()
    await router.push({ path: '/', query: { d: saved } })
  }
  catch (error) {
    toasts.error(error instanceof Error ? error.message : 'Failed to save domain')
  }
}

function reset() {
  domain.value = ''
  server.value = config.public.defaultAcmednsUrl || 'http://acmedns-server'
  submitted.value = false
  pendingData.value = null
  step.value = 'form'
  resetDns()
}
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-6">
    <header>
      <h1 class="text-3xl font-semibold tracking-tight">Register domain</h1>
      <p class="mt-2 max-w-[65ch] text-muted">
        Creates an acme-dns account, then stores the login in clientstorage.json for Certbot.
      </p>
    </header>

    <RegisterForm
      v-if="step === 'form'"
      v-model:domain="domain"
      v-model:server="server"
      :pending
      :submitted
      @submit="handleSubmit"
    />

    <template v-else-if="pendingData">
      <CnameRecipe :domain="domain.trim()" :fulldomain="pendingData.fulldomain" />

      <DnsProgress
        v-if="step === 'poll'"
        :status="dnsStatus"
        :attempts
        :total-attempts="totalAttempts"
        :message="dnsMessage"
        @cancel="cancelValidation"
      />

      <div v-else-if="step === 'cname'" class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-[6px] bg-signal px-4 py-2 text-sm text-signal-ink"
          @click="startValidation"
        >
          Validate
        </button>
        <button
          type="button"
          class="rounded-[6px] border border-rule px-4 py-2 text-sm"
          @click="skipValidation"
        >
          Skip
        </button>
      </div>

      <section v-if="step === 'save'" class="flex flex-col gap-4 border border-rule bg-panel p-4" style="border-radius: var(--radius-panel)">
        <h2 class="font-semibold">Save domain data?</h2>
        <p class="text-sm text-muted">
          acme-dns will not show this username and password again. Save them now, or they are gone.
        </p>
        <UiSecretField label="Username" :value="pendingData.username" />
        <UiSecretField label="Password" :value="pendingData.password" />
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-[6px] bg-signal px-4 py-2 text-sm text-signal-ink"
            @click="persist(true)"
          >
            Save
          </button>
          <button
            type="button"
            class="rounded-[6px] border border-rule px-4 py-2 text-sm"
            @click="persist(false)"
          >
            Discard
          </button>
        </div>
      </section>
    </template>

    <UiConfirmDialog
      v-model:open="overwriteOpen"
      title="Domain already exists"
      confirm-label="Overwrite"
      cancel-label="Keep existing"
      danger
      @confirm="registerAccount"
    >
      {{ domain }} is already in storage. Overwrite registers a new acme-dns account and replaces the saved login.
    </UiConfirmDialog>
  </div>
</template>
