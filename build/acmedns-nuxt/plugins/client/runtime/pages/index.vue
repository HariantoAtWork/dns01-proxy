<script setup lang="ts">
import { PhList as List, PhCaretDown as CaretDown, PhX as Close } from '@phosphor-icons/vue'

useHead({ title: 'Home' })

const route = useRoute()
const router = useRouter()
const { entries, status, error, refresh } = useClientStorage()

const selected = computed(() => {
  const query = route.query.d
  return typeof query === 'string' ? query : ''
})

const current = computed(() => entries.value.find(entry => entry.domain === selected.value) ?? entries.value[0] ?? null)

const sidebarOpen = ref(false)

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

watch(sidebarOpen, (open) => {
  if (!import.meta.client) {
    return
  }
  document.body.style.overflow = open ? 'hidden' : ''
})

onBeforeUnmount(() => {
  if (import.meta.client) {
    document.body.style.overflow = ''
  }
})

function select(domain: string) {
  void router.replace({ query: { d: domain } })
  sidebarOpen.value = false
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

    <div v-else>
      <div
        class="sticky top-12 z-[15] -mx-3 -mt-1 mb-2 border-b border-rule bg-paper/95 backdrop-blur-md md:hidden"
      >
        <button
          type="button"
          class="flex h-8 w-full items-center justify-between gap-2 px-1 text-sm text-ink"
          :aria-expanded="sidebarOpen"
          aria-controls="domain-sidebar-mobile"
          @click="sidebarOpen = !sidebarOpen"
        >
          <span class="flex min-w-0 items-center gap-2">
            <List :size="16" weight="regular" class="shrink-0 text-muted" aria-hidden="true" />
            <span class="shrink-0 font-medium">Domains</span>
            <span
              v-if="current"
              class="truncate text-muted"
            >
              {{ current.domain }}
            </span>
          </span>
          <CaretDown
            :size="14"
            weight="bold"
            class="shrink-0 text-muted transition-transform"
            :class="sidebarOpen && 'rotate-180'"
            aria-hidden="true"
          />
        </button>
      </div>

      <Teleport to="body">
        <Transition name="domain-backdrop">
          <button
            v-if="sidebarOpen"
            type="button"
            class="fixed inset-0 z-[14] bg-ink/45 md:hidden"
            aria-label="Close domain list"
            @click="sidebarOpen = false"
          />
        </Transition>

        <Transition name="domain-drawer">
          <aside
            v-if="sidebarOpen"
            id="domain-sidebar-mobile"
            class="fixed inset-y-0 left-0 z-[16] flex w-[min(18rem,88vw)] flex-col border-r border-rule bg-paper pt-12 shadow-[0_16px_40px_var(--shadow)] md:hidden"
            aria-label="Domain list"
          >
            <div class="flex items-center justify-between border-b border-rule px-3 py-2">
              <p class="text-sm font-medium">Domains</p>
              <button
                type="button"
                class="inline-flex rounded-[6px] p-2 text-muted hover:bg-panel hover:text-ink"
                aria-label="Close domain list"
                @click="sidebarOpen = false"
              >
                <Close :size="16" weight="regular" aria-hidden="true" />
              </button>
            </div>
            <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <DomainList
                :entries
                :selected="current?.domain || ''"
                @select="select"
              />
            </div>
          </aside>
        </Transition>
      </Teleport>

      <div class="grid gap-6 md:grid-cols-[16rem_minmax(0,1fr)]">
        <aside class="hidden border-r border-rule md:block">
          <DomainList
            class="max-h-[calc(100dvh-8rem)] min-h-[28rem] overflow-y-auto overscroll-contain"
            :entries
            :selected="current?.domain || ''"
            @select="select"
          />
        </aside>

        <DomainDetail
          v-if="current"
          :entry="current"
          @deleted="onDeleted"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.domain-backdrop-enter-active,
.domain-backdrop-leave-active {
  transition: opacity 0.22s ease;
}

.domain-backdrop-enter-from,
.domain-backdrop-leave-to {
  opacity: 0;
}

.domain-drawer-enter-active,
.domain-drawer-leave-active {
  transition: transform 0.28s ease;
}

.domain-drawer-enter-from,
.domain-drawer-leave-to {
  transform: translateX(-100%);
}
</style>
