<script setup lang="ts">
import {
  PhCheckCircle as CheckCircle,
  PhWarningCircle as Warning,
  PhXCircle as XCircle,
  PhCircleNotch as Spinner,
} from '@phosphor-icons/vue'
import type { DomainEntry } from '#shared/types/clientstorage'
import type { AccountVerifyResult } from '../../composables/useAccountVerify'

const { entries, selected, validity = {}, validityPending = false } = defineProps<{
  entries: DomainEntry[]
  selected: string
  validity?: Record<string, AccountVerifyResult>
  validityPending?: boolean
}>()

const emit = defineEmits<{
  select: [domain: string]
}>()

function iconFor(domain: string) {
  const result = validity[domain]
  if (!result) {
    return validityPending ? 'pending' : 'unknown'
  }
  if (result.ok) {
    return 'ok'
  }
  return result.status === 'unreachable' ? 'unreachable' : 'invalid'
}
</script>

<template>
  <nav aria-label="Stored domains">
    <ul class="divide-y divide-rule">
      <li v-for="entry in entries" :key="entry.domain">
        <button
          type="button"
          class="flex w-full items-start gap-2 px-3 py-3 text-left hover:bg-panel"
          :class="selected === entry.domain && 'bg-panel'"
          :aria-current="selected === entry.domain ? 'true' : undefined"
          @click="emit('select', entry.domain)"
        >
          <span
            class="mt-0.5 shrink-0"
            :title="validity[entry.domain]?.message
              || (iconFor(entry.domain) === 'pending' ? 'Checking account…' : 'Account not checked yet')"
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
          </span>
          <span class="min-w-0 flex-1">
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
          </span>
        </button>
      </li>
    </ul>
  </nav>
</template>
