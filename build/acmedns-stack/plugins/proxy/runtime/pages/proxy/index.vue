<script setup lang="ts">
import {
  PhArrowRight as ArrowRight,
  PhListChecks as ListChecks,
  PhSwap as Swap,
} from '@phosphor-icons/vue'

useHead({ title: 'Proxy' })

const toasts = useToasts()
const { hosts, pending: hostsPending, error: hostsError, loadHosts } = useProxyHosts()
const {
  lists,
  settings,
  denies,
  pending: listsPending,
  error: listsError,
  loadLists,
  loadSettings,
  loadDenies,
} = useAccessLists()

const pending = computed(() => hostsPending.value || listsPending.value)

const enabledHosts = computed(() => hosts.value.filter(host => host.enabled).length)
const boundHosts = computed(() => hosts.value.filter(host => Boolean(host.accessListId)).length)

async function refresh() {
  try {
    await Promise.all([loadHosts(), loadLists(), loadSettings(), loadDenies()])
  }
  catch {
    toasts.error(hostsError.value || listsError.value || 'Failed to load proxy overview', 'Proxy')
  }
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="flex flex-col gap-8">
    <div class="flex flex-col gap-1">
      <h2 class="text-xl font-semibold tracking-tight text-ink">
        Overview
      </h2>
      <p class="max-w-[65ch] text-sm text-muted">
        Bun reverse proxy on <span class="font-mono">:80/:443</span>.
        Operator UI and acme-dns API stay on
        <span class="font-mono">:1080/:1443</span>.
      </p>
    </div>

    <div
      class="grid gap-3 sm:grid-cols-3"
      :aria-busy="pending"
    >
      <div class="rounded-[var(--radius-panel)] border border-rule bg-panel px-4 py-3">
        <p class="text-xs uppercase tracking-wide text-muted">
          Hosts
        </p>
        <p class="mt-1 text-2xl font-semibold tabular-nums text-ink">
          {{ hosts.length }}
        </p>
        <p class="mt-1 text-xs text-muted">
          {{ enabledHosts }} enabled
        </p>
      </div>
      <div class="rounded-[var(--radius-panel)] border border-rule bg-panel px-4 py-3">
        <p class="text-xs uppercase tracking-wide text-muted">
          Access lists
        </p>
        <p class="mt-1 text-2xl font-semibold tabular-nums text-ink">
          {{ lists.length }}
        </p>
        <p class="mt-1 text-xs text-muted">
          {{ boundHosts }} hosts bound
        </p>
      </div>
      <div class="rounded-[var(--radius-panel)] border border-rule bg-panel px-4 py-3">
        <p class="text-xs uppercase tracking-wide text-muted">
          Client IP trust
        </p>
        <p class="mt-1 text-2xl font-semibold text-ink">
          {{ settings.trustForwardedClientIp ? 'On' : 'Off' }}
        </p>
        <p class="mt-1 text-xs text-muted">
          {{ denies.length }} recent {{ denies.length === 1 ? 'deny' : 'denies' }}
        </p>
      </div>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <NuxtLink
        to="/proxy/hosts"
        class="group flex items-start gap-3 rounded-[var(--radius-panel)] border border-rule bg-panel px-4 py-4 text-ink no-underline transition-colors hover:border-signal"
      >
        <Swap
          :size="20"
          weight="duotone"
          class="mt-0.5 shrink-0 text-signal"
          aria-hidden="true"
        />
        <div class="min-w-0 flex-1">
          <p class="font-medium">
            Hosts
          </p>
          <p class="mt-1 text-sm text-muted">
            Domain → forward target routes on the edge.
          </p>
        </div>
        <ArrowRight
          :size="16"
          weight="bold"
          class="mt-1 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
          aria-hidden="true"
        />
      </NuxtLink>

      <NuxtLink
        to="/proxy/access-lists"
        class="group flex items-start gap-3 rounded-[var(--radius-panel)] border border-rule bg-panel px-4 py-4 text-ink no-underline transition-colors hover:border-signal"
      >
        <ListChecks
          :size="20"
          weight="duotone"
          class="mt-0.5 shrink-0 text-signal"
          aria-hidden="true"
        />
        <div class="min-w-0 flex-1">
          <p class="font-medium">
            Access Lists
          </p>
          <p class="mt-1 text-sm text-muted">
            IP allow/deny and Basic Auth for bound hosts.
          </p>
        </div>
        <ArrowRight
          :size="16"
          weight="bold"
          class="mt-1 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
          aria-hidden="true"
        />
      </NuxtLink>
    </div>
  </div>
</template>
