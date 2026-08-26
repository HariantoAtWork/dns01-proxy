<script setup lang="ts">
import type { CertStatusEntry, DomainsParseResult } from '#shared/types/certs'

useHead({ title: 'Home' })

const route = useRoute()

// Legacy bookmarks: `/?d=host` still open the domain detail view.
if (typeof route.query.d === 'string' && route.query.d) {
  await navigateTo(
    { path: '/domains', query: route.query },
    { replace: true },
  )
}

const { entries, status: storageStatus, error: storageError, refresh: refreshStorage } = useClientStorage()
const { items: backupItems, status: backupStatus } = useBackups()

const { data: certPayload, status: certStatus, error: certError, refresh: refreshCerts } = useFetch<{
  mode: string
  entries: CertStatusEntry[]
}>('/api/certs/status', {
  key: 'home-cert-status',
  query: { mode: 'production' },
})

const { data: domainsFile, status: domainsFileStatus } = useFetch<DomainsParseResult>('/api/certs/domains', {
  key: 'home-domains-file',
})

const accountCount = computed(() => entries.value.length)
const { sharedMode, cnameTarget } = useSharedMode()

const serverBreakdown = computed(() => {
  const counts = new Map<string, number>()
  for (const entry of entries.value) {
    const key = (entry.details.server_url || '').replace(/\/$/, '') || '(no server_url)'
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([server, count]) => ({ server, count }))
    .sort((a, b) => b.count - a.count || a.server.localeCompare(b.server))
})

const certEntries = computed(() => certPayload.value?.entries ?? [])
const certOk = computed(() => certEntries.value.filter(e => e.status === 'ok').length)
const certAttention = computed(() => certEntries.value.filter(e => e.status !== 'ok').length)
const certLive = computed(() => certEntries.value.filter(e => e.liveOnDisk || e.tree === 'live').length)

const domainsLineCount = computed(() => domainsFile.value?.lines?.length ?? 0)
const domainsFileOk = computed(() => domainsFile.value?.ok !== false)

const backupCount = computed(() => backupItems.value.length)

const loading = computed(() =>
  storageStatus.value === 'pending'
  || certStatus.value === 'pending'
  || backupStatus.value === 'pending'
  || domainsFileStatus.value === 'pending',
)

async function refreshAll() {
  await Promise.all([
    refreshStorage(),
    refreshCerts(),
  ])
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Home</h1>
        <p class="mt-1 max-w-[52ch] text-sm text-muted">
          Counts from clientstorage, domains.txt, live certificates, and backups.
        </p>
      </div>
      <UiButton variant="ghost" size="sm" :disabled="loading" @click="refreshAll">
        Refresh
      </UiButton>
    </header>

    <div
      v-if="loading && !accountCount && !certEntries.length"
      class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div
        v-for="n in 4"
        :key="n"
        class="h-28 animate-pulse border border-rule bg-panel"
        style="border-radius: var(--radius-panel)"
      />
    </div>

    <template v-else>
      <div
        v-if="storageError || certError"
        class="border border-danger bg-panel p-3 text-sm text-danger"
        style="border-radius: var(--radius-panel)"
      >
        <p v-if="storageError">Storage: {{ storageError.message || 'Failed to load' }}</p>
        <p v-if="certError">Certificates: {{ certError.message || 'Failed to load' }}</p>
      </div>

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NuxtLink
          to="/domains"
          class="border border-rule bg-panel p-4 text-ink no-underline transition-colors hover:border-signal"
          style="border-radius: var(--radius-panel)"
        >
          <p class="text-xs uppercase tracking-wide text-muted">Accounts</p>
          <p class="mt-2 font-mono text-3xl font-semibold tabular-nums">{{ accountCount }}</p>
          <p v-if="sharedMode" class="mt-1 text-sm text-muted">
            Shared mode — CNAME to {{ cnameTarget || 'auth zone' }}
          </p>
          <p v-else class="mt-1 text-sm text-muted">in clientstorage.json</p>
        </NuxtLink>

        <NuxtLink
          to="/certs"
          class="border border-rule bg-panel p-4 text-ink no-underline transition-colors hover:border-signal"
          style="border-radius: var(--radius-panel)"
        >
          <p class="text-xs uppercase tracking-wide text-muted">domains.txt</p>
          <p class="mt-2 font-mono text-3xl font-semibold tabular-nums">{{ domainsLineCount }}</p>
          <p class="mt-1 text-sm" :class="domainsFileOk ? 'text-muted' : 'text-danger'">
            {{ domainsFileOk ? 'cert line(s)' : 'has validation errors' }}
          </p>
        </NuxtLink>

        <NuxtLink
          to="/certs"
          class="border border-rule bg-panel p-4 text-ink no-underline transition-colors hover:border-signal"
          style="border-radius: var(--radius-panel)"
        >
          <p class="text-xs uppercase tracking-wide text-muted">Live certs</p>
          <p class="mt-2 font-mono text-3xl font-semibold tabular-nums text-live">{{ certOk }}</p>
          <p class="mt-1 text-sm text-muted">
            <span class="tabular-nums">{{ certLive }}</span> on disk
            <template v-if="certAttention">
              · <span class="text-danger tabular-nums">{{ certAttention }}</span> need attention
            </template>
          </p>
        </NuxtLink>

        <NuxtLink
          to="/backup"
          class="border border-rule bg-panel p-4 text-ink no-underline transition-colors hover:border-signal"
          style="border-radius: var(--radius-panel)"
        >
          <p class="text-xs uppercase tracking-wide text-muted">Backups</p>
          <p class="mt-2 font-mono text-3xl font-semibold tabular-nums">{{ backupCount }}</p>
          <p class="mt-1 text-sm text-muted">snapshot file(s)</p>
        </NuxtLink>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <UiPanel>
          <div class="flex items-baseline justify-between gap-2">
            <h2 class="text-sm font-semibold">acme-dns servers</h2>
            <NuxtLink to="/domains" class="text-xs text-muted no-underline hover:text-signal">
              Open domains
            </NuxtLink>
          </div>
          <p v-if="sharedMode" class="mt-3 text-sm text-muted">
            No per-domain accounts.
            <NuxtLink to="/domains" class="text-ink underline-offset-2 hover:underline">DNS setup</NuxtLink>
            shows CNAME rows from domains.txt.
          </p>
          <p v-else-if="!serverBreakdown.length" class="mt-3 text-sm text-muted">
            No accounts yet.
            <NuxtLink to="/register" class="text-ink underline-offset-2 hover:underline">Register</NuxtLink>
            to store credentials.
          </p>
          <ul v-else class="mt-3 divide-y divide-rule">
            <li
              v-for="row in serverBreakdown"
              :key="row.server"
              class="flex items-baseline justify-between gap-3 py-2"
            >
              <span class="min-w-0 break-all font-mono text-sm text-ink">{{ row.server }}</span>
              <span class="shrink-0 font-mono text-sm tabular-nums text-muted">{{ row.count }}</span>
            </li>
          </ul>
        </UiPanel>

        <UiPanel>
          <div class="flex items-baseline justify-between gap-2">
            <h2 class="text-sm font-semibold">Certificate attention</h2>
            <NuxtLink to="/certs" class="text-xs text-muted no-underline hover:text-signal">
              Open certs
            </NuxtLink>
          </div>
          <p v-if="!certAttention" class="mt-3 text-sm text-muted">
            {{ certEntries.length ? 'All indexed production lines look ok.' : 'No certificate lines indexed yet.' }}
          </p>
          <ul v-else class="mt-3 divide-y divide-rule">
            <li
              v-for="entry in certEntries.filter(e => e.status !== 'ok').slice(0, 8)"
              :key="entry.certName"
              class="flex items-baseline justify-between gap-3 py-2"
            >
              <span class="min-w-0 truncate font-mono text-sm text-ink">{{ entry.certName }}</span>
              <span class="shrink-0 font-mono text-xs uppercase tracking-wide text-danger">
                {{ entry.status }}
              </span>
            </li>
          </ul>
        </UiPanel>
      </div>
    </template>
  </div>
</template>
