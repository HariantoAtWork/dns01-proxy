<script setup lang="ts">
import { PhCopy as Copy, PhGlobe as Globe, PhArrowsClockwise as Refresh } from '@phosphor-icons/vue'
import type { PublicIpAddress, PublicIpOrigin, VisitIpAddress } from '#shared/types/network'

const open = ref(false)
const dialogId = useId()

const {
  data,
  error,
  refresh,
  visit,
  addresses,
  multiplePerFamily,
  ipv6OnlyInBrowser,
  loading,
  refreshing,
  load,
} = usePublicIps()
const { copyText } = useClipboardCopy()

watch(open, (value) => {
  if (value) {
    void load()
  }
})

function toggle() {
  open.value = !open.value
}

const checkedLabel = computed(() => {
  const at = data.value?.checkedAt
  if (!at) {
    return ''
  }
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(at))
})

const visitMatches = computed(() => {
  const current = visit.value
  if (!current) {
    return false
  }
  return addresses.value.some(item => item.address === current.address)
})

function familyLabel(family: 4 | 6) {
  return family === 4 ? 'IPv4' : 'IPv6'
}

function originLabel(origins: PublicIpOrigin[]) {
  return origins.map(origin => origin === 'host' ? 'this host' : 'this browser').join(', ')
}

function sourceLabel(item: PublicIpAddress) {
  return `${familyLabel(item.family)} · ${originLabel(item.origins)} · ${item.sources.join(', ')}`
}

function visitHint(item: VisitIpAddress) {
  if (visitMatches.value) {
    return `Same as a listed address · ${item.via}`
  }
  if (!item.public) {
    return `LAN or container · ${item.via}`
  }
  return item.via
}
</script>

<template>
  <div>
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-sm text-muted transition-colors hover:bg-panel hover:text-ink md:px-3 md:py-2"
      :class="open && 'bg-panel text-ink'"
      :aria-expanded="open"
      :aria-pressed="open"
      aria-haspopup="dialog"
      :aria-controls="dialogId"
      aria-label="Public internet"
      @click="toggle"
    >
      <Globe :size="16" weight="regular" aria-hidden="true" />
      <span class="hidden sm:inline" aria-hidden="true">Internet</span>
    </button>

    <UiModal :id="dialogId" v-model:open="open" title="Public internet">
      <template #actions>
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-[6px] border border-rule px-3 py-2 text-sm text-ink hover:bg-paper"
          :disabled="loading || refreshing"
          @click="refresh()"
        >
          <Refresh :size="16" weight="regular" aria-hidden="true" />
          Refresh
        </button>
      </template>

      <p class="max-w-[65ch] text-sm text-muted">
        Addresses the internet sees for this host and this browser.
        The host IPv4 (and IPv6 if the nameserver answers on it) go on the acme-dns A/AAAA glue.
      </p>

      <div v-if="loading" class="mt-4 h-16 animate-pulse bg-paper" style="border-radius: var(--radius-input)" />

      <div
        v-else-if="error || (data && !data.success && !addresses.length)"
        class="mt-4 border border-danger bg-paper p-3 text-sm"
        style="border-radius: var(--radius-input)"
      >
        <p class="font-medium">Could not see a public address</p>
        <p class="mt-1 text-muted">{{ error?.message || data?.message || 'Echo lookups failed.' }}</p>
      </div>

      <ul
        v-else-if="addresses.length"
        class="mt-4 divide-y divide-rule border border-rule bg-paper"
        style="border-radius: var(--radius-input)"
      >
        <li
          v-for="item in addresses"
          :key="item.address"
          class="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
        >
          <div class="min-w-0">
            <p class="font-mono text-sm text-ink">{{ item.address }}</p>
            <p class="mt-0.5 text-xs text-muted">
              {{ sourceLabel(item) }}
            </p>
          </div>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-[4px] border border-rule px-2 py-1 text-sm text-muted hover:text-ink"
            @click="copyText(item.address, familyLabel(item.family))"
          >
            <Copy :size="14" weight="regular" aria-hidden="true" />
            Copy
          </button>
        </li>
      </ul>

      <p
        v-if="multiplePerFamily"
        class="mt-3 text-sm text-ink"
      >
        More than one address in the same family. Multi-WAN can do that.
        The A/AAAA record needs the IP that answers UDP/TCP 53.
      </p>

      <p
        v-else-if="ipv6OnlyInBrowser"
        class="mt-3 text-sm text-muted"
      >
        IPv6 is visible from this browser, not from the container.
        Docker NAT is often IPv4-only. An AAAA still needs the nameserver reachable on that address.
      </p>

      <p
        v-else-if="addresses.length && !addresses.some(item => item.family === 6)"
        class="mt-3 text-sm text-muted"
      >
        No IPv6 from this host or this browser. An AAAA is optional if you only publish A.
      </p>

      <p v-if="visit" class="mt-3 text-sm text-muted">
        This visit:
        <button
          type="button"
          class="font-mono text-ink hover:underline"
          @click="copyText(visit.address, 'Visit address')"
        >
          {{ visit.address }}
        </button>
        <span> · {{ visitHint(visit) }}</span>
      </p>

      <p v-if="checkedLabel" class="mt-2 text-xs text-muted">
        Checked {{ checkedLabel }}
      </p>
    </UiModal>
  </div>
</template>
