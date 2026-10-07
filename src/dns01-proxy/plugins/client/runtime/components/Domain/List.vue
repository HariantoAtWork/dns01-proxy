<script setup lang="ts">
import {
  PhCheckCircle as CheckCircle,
  PhWarningCircle as Warning,
  PhXCircle as XCircle,
  PhCircleNotch as Spinner,
} from '@phosphor-icons/vue'
import type { DomainEntry } from '#shared/types/clientstorage'
import type { AccountVerifyResult } from '../../composables/useAccountVerify'

const { entries, selected, validity = {}, validityPending = false, checking = [] } = defineProps<{
  entries: DomainEntry[]
  selected: string
  validity?: Record<string, AccountVerifyResult>
  validityPending?: boolean
  checking?: string[]
}>()

const emit = defineEmits<{
  select: [domain: string]
  recheck: [domain: string]
}>()

function iconFor(domain: string) {
  if (checking.includes(domain)) {
    return 'pending'
  }
  const result = validity[domain]
  if (!result) {
    return validityPending ? 'pending' : 'unknown'
  }
  if (result.ok) {
    return 'ok'
  }
  return result.status === 'unreachable' ? 'unreachable' : 'invalid'
}

function isRecheckDisabled(domain: string) {
  return validityPending || checking.includes(domain)
}

function statusTitle(domain: string) {
  if (checking.includes(domain) || (validityPending && !validity[domain])) {
    return 'Checking account…'
  }
  if (isRecheckDisabled(domain)) {
    return 'Recheck unavailable'
  }
  const detail = validity[domain]?.message
  return detail ? `Recheck account — ${detail}` : 'Recheck account'
}
</script>

<template>
  <nav aria-label="Stored domains">
    <ul class="divide-y divide-rule">
      <li v-for="entry in entries" :key="entry.domain" class="flex items-start gap-1 px-2 py-2">
        <button
          type="button"
          class="mt-1 inline-flex shrink-0 cursor-pointer rounded-[4px] p-0.5 hover:bg-panel disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="isRecheckDisabled(entry.domain)"
          :aria-label="`Recheck account for ${entry.domain}`"
          :title="statusTitle(entry.domain)"
          @click.stop="emit('recheck', entry.domain)"
        >
          <Spinner
            v-if="iconFor(entry.domain) === 'pending'"
            :size="16"
            class="animate-spin text-muted"
            weight="regular"
            aria-hidden="true"
          />
          <CheckCircle
            v-else-if="iconFor(entry.domain) === 'ok'"
            :size="16"
            class="text-live"
            weight="fill"
            aria-hidden="true"
          />
          <XCircle
            v-else-if="iconFor(entry.domain) === 'invalid'"
            :size="16"
            class="text-danger"
            weight="fill"
            aria-hidden="true"
          />
          <Warning
            v-else-if="iconFor(entry.domain) === 'unreachable'"
            :size="16"
            class="text-signal"
            weight="fill"
            aria-hidden="true"
          />
          <span
            v-else
            class="inline-block h-4 w-4 rounded-full border border-rule"
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          class="min-w-0 flex-1 rounded-[4px] px-1 py-1 text-left hover:bg-panel"
          :class="selected === entry.domain && 'bg-panel'"
          :aria-current="selected === entry.domain ? 'true' : undefined"
          @click="emit('select', entry.domain)"
        >
          <span class="block font-medium">{{ entry.domain }}</span>
          <span class="mt-1 block w-full truncate font-mono text-xs text-muted">
            {{ entry.details.fulldomain }}
          </span>
          <span
            v-if="validity[entry.domain] && !validity[entry.domain]!.ok"
            class="mt-1 block text-xs text-danger"
          >
            {{ validity[entry.domain]!.message }}
          </span>
        </button>
      </li>
    </ul>
  </nav>
</template>
