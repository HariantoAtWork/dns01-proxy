<script setup lang="ts">
useHead({ title: 'Home' })

const route = useRoute()
const router = useRouter()
const { entries, status, error, refresh } = useClientStorage()

const selected = computed(() => {
  const query = route.query.d
  return typeof query === 'string' ? query : ''
})

const current = computed(() => entries.value.find(entry => entry.domain === selected.value) ?? entries.value[0] ?? null)

watch(entries, (list) => {
  if (!list.length) {
    return
  }
  if (selected.value && list.some(entry => entry.domain === selected.value)) {
    return
  }
  if (!selected.value && list[0]) {
    void router.replace({ query: { d: list[0].domain } })
  }
}, { immediate: true })

function select(domain: string) {
  void router.replace({ query: { d: domain } })
}

function onDeleted() {
  const remaining = entries.value.filter(entry => entry.domain !== selected.value)
  void router.replace({ query: remaining[0] ? { d: remaining[0].domain } : {} })
}
</script>

<template>
  <div>
    <div v-if="status === 'pending'" class="grid gap-6 md:grid-cols-[16rem_minmax(0,1fr)]">
      <div class="h-64 animate-pulse bg-panel" style="border-radius: var(--radius-panel)" />
      <div class="h-64 animate-pulse bg-panel" style="border-radius: var(--radius-panel)" />
    </div>

    <div v-else-if="error" class="border border-danger bg-panel p-4" style="border-radius: var(--radius-panel)">
      <p class="font-medium">Could not load clientstorage.json</p>
      <p class="mt-1 text-sm text-muted">{{ error.message || 'Failed to load data' }}</p>
      <button
        type="button"
        class="mt-3 rounded-[6px] bg-signal px-3 py-2 text-sm text-signal-ink"
        @click="refresh()"
      >
        Retry
      </button>
    </div>

    <UiEmptyState
      v-else-if="!entries.length"
      title="No domains stored"
      action-label="Register"
      to="/register"
    >
      Register a hostname to write the CNAME and keep the acme-dns login next to Certbot.
    </UiEmptyState>

    <div v-else class="grid gap-6 md:grid-cols-[16rem_minmax(0,1fr)]">
      <DomainList :entries :selected="current?.domain || ''" @select="select" />
      <DomainDetail v-if="current" :entry="current" @deleted="onDeleted" />
    </div>
  </div>
</template>
