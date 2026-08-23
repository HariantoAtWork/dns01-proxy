<script setup lang="ts">
import { PhCopy as Copy, PhEye as Eye, PhEyeSlash as EyeSlash } from '@phosphor-icons/vue'
import type { AcmeDnsCredentials } from '#shared/types/clientstorage'

const { details } = defineProps<{
  details: AcmeDnsCredentials
}>()

const { copyText } = useClipboardCopy()
const showUsername = ref(false)
const showPassword = ref(false)

function mask(value: string) {
  return value ? '•'.repeat(Math.min(value.length, 24)) : ''
}
</script>

<template>
  <UiPanel accent>
    <h2 class="text-base font-semibold tracking-tight">Account secrets</h2>
    <p class="mt-1 text-sm text-muted">
      Click to copy. Secrets stay hidden until revealed.
    </p>

    <dl class="mt-3 grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 font-mono text-sm">
      <dt class="text-xs uppercase tracking-wide text-muted">Username</dt>
      <dd class="flex min-w-0 items-center gap-1">
        <button
          type="button"
          class="block min-w-0 flex-1 cursor-copy truncate text-left text-ink hover:text-signal"
          :title="showUsername ? details.username : 'Username'"
          @click="copyText(details.username, 'Username')"
        >
          {{ showUsername ? details.username : mask(details.username) }}
        </button>
        <button
          type="button"
          class="inline-flex h-7 w-7 shrink-0 items-center justify-center text-muted hover:text-ink"
          :aria-pressed="showUsername"
          :aria-label="showUsername ? 'Hide Username' : 'Reveal Username'"
          @click="showUsername = !showUsername"
        >
          <EyeSlash v-if="showUsername" :size="14" weight="regular" aria-hidden="true" />
          <Eye v-else :size="14" weight="regular" aria-hidden="true" />
        </button>
      </dd>

      <dt class="text-xs uppercase tracking-wide text-muted">Password</dt>
      <dd class="flex min-w-0 items-center gap-1">
        <button
          type="button"
          class="block min-w-0 flex-1 cursor-copy truncate text-left text-ink hover:text-signal"
          :title="showPassword ? details.password : 'Password'"
          @click="copyText(details.password, 'Password')"
        >
          {{ showPassword ? details.password : mask(details.password) }}
        </button>
        <button
          type="button"
          class="inline-flex h-7 w-7 shrink-0 items-center justify-center text-muted hover:text-ink"
          :aria-pressed="showPassword"
          :aria-label="showPassword ? 'Hide Password' : 'Reveal Password'"
          @click="showPassword = !showPassword"
        >
          <EyeSlash v-if="showPassword" :size="14" weight="regular" aria-hidden="true" />
          <Eye v-else :size="14" weight="regular" aria-hidden="true" />
        </button>
      </dd>

      <dt class="text-xs uppercase tracking-wide text-muted">Subdomain</dt>
      <dd class="flex min-w-0 items-center gap-1">
        <button
          type="button"
          class="block min-w-0 flex-1 cursor-copy truncate text-left text-ink hover:text-signal"
          :title="details.subdomain"
          @click="copyText(details.subdomain, 'Subdomain')"
        >
          {{ details.subdomain }}
        </button>
        <button
          type="button"
          class="inline-flex h-7 w-7 shrink-0 items-center justify-center text-muted hover:text-ink"
          aria-label="Copy Subdomain"
          @click="copyText(details.subdomain, 'Subdomain')"
        >
          <Copy :size="14" weight="regular" aria-hidden="true" />
        </button>
      </dd>

      <dt class="text-xs uppercase tracking-wide text-muted">Full domain</dt>
      <dd class="flex min-w-0 items-center gap-1">
        <button
          type="button"
          class="block min-w-0 flex-1 cursor-copy truncate text-left text-ink hover:text-signal"
          :title="details.fulldomain"
          @click="copyText(details.fulldomain, 'Full domain')"
        >
          {{ details.fulldomain }}
        </button>
        <button
          type="button"
          class="inline-flex h-7 w-7 shrink-0 items-center justify-center text-muted hover:text-ink"
          aria-label="Copy Full domain"
          @click="copyText(details.fulldomain, 'Full domain')"
        >
          <Copy :size="14" weight="regular" aria-hidden="true" />
        </button>
      </dd>
      <dd class="col-start-2 -mt-1 font-sans text-xs text-muted">CNAME target</dd>
    </dl>
  </UiPanel>
</template>
