<script setup lang="ts">
import {
  PhArrowRight as ArrowRight,
  PhDesktopTower as DesktopTower,
  PhGitFork as GitFork,
} from '@phosphor-icons/vue'

useHead({ title: 'Router' })

const toasts = useToasts()
const { targets, pending: targetsPending, error: targetsError, loadTargets } = useRouterTargets()
const { sources, pending: sourcesPending, error: sourcesError, loadSources } = useRouterSources()

const binds = ref<Array<{ key: string, protocol: string, listenPort: number }>>([])
const pending = computed(() => targetsPending.value || sourcesPending.value)
const enabledSources = computed(() => sources.value.filter(source => source.enabled).length)
const enabledTargets = computed(() => targets.value.filter(target => target.enabled).length)

async function refresh() {
  try {
    const [status] = await Promise.all([
      $fetch<{ binds: Array<{ key: string, protocol: string, listenPort: number }> }>('/api/router/status'),
      loadTargets(),
      loadSources(),
    ])
    binds.value = status.binds
  }
  catch {
    toasts.error(targetsError.value || sourcesError.value || 'Failed to load router overview', 'Router')
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
        L4 TCP/UDP port forward: source hostnames own port maps to named targets.
        Not HTTP — use Proxy for <span class="font-mono">:80/:443</span> reverse proxy.
        Opening game ports exposes the target on the internet; publish ports in Compose (or use host networking).
      </p>
    </div>

    <div
      class="grid gap-3 sm:grid-cols-3"
      :aria-busy="pending"
    >
      <div class="rounded-[var(--radius-panel)] border border-rule bg-panel px-4 py-3">
        <p class="text-xs uppercase tracking-wide text-muted">
          Sources
        </p>
        <p class="mt-1 text-2xl font-semibold tabular-nums text-ink">
          {{ sources.length }}
        </p>
        <p class="mt-1 text-xs text-muted">
          {{ enabledSources }} enabled
        </p>
      </div>
      <div class="rounded-[var(--radius-panel)] border border-rule bg-panel px-4 py-3">
        <p class="text-xs uppercase tracking-wide text-muted">
          Targets
        </p>
        <p class="mt-1 text-2xl font-semibold tabular-nums text-ink">
          {{ targets.length }}
        </p>
        <p class="mt-1 text-xs text-muted">
          {{ enabledTargets }} enabled
        </p>
      </div>
      <div class="rounded-[var(--radius-panel)] border border-rule bg-panel px-4 py-3">
        <p class="text-xs uppercase tracking-wide text-muted">
          Active binds
        </p>
        <p class="mt-1 text-2xl font-semibold tabular-nums text-ink">
          {{ binds.length }}
        </p>
        <p class="mt-1 text-xs text-muted">
          TCP/UDP listeners in this process
        </p>
      </div>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <NuxtLink
        to="/router/sources"
        class="group flex items-start gap-3 rounded-[var(--radius-panel)] border border-rule bg-panel px-4 py-4 no-underline transition-colors hover:border-signal/40"
      >
        <GitFork
          :size="22"
          weight="duotone"
          class="mt-0.5 shrink-0 text-signal"
          aria-hidden="true"
        />
        <div class="min-w-0 flex-1">
          <p class="font-medium text-ink">
            Sources
          </p>
          <p class="mt-1 text-sm text-muted">
            Public hostnames and port maps (Sunshine preset available).
          </p>
        </div>
        <ArrowRight
          :size="18"
          class="mt-1 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </NuxtLink>
      <NuxtLink
        to="/router/targets"
        class="group flex items-start gap-3 rounded-[var(--radius-panel)] border border-rule bg-panel px-4 py-4 no-underline transition-colors hover:border-signal/40"
      >
        <DesktopTower
          :size="22"
          weight="duotone"
          class="mt-0.5 shrink-0 text-signal"
          aria-hidden="true"
        />
        <div class="min-w-0 flex-1">
          <p class="font-medium text-ink">
            Targets
          </p>
          <p class="mt-1 text-sm text-muted">
            Named machines (host/IP) that receive forwarded traffic.
          </p>
        </div>
        <ArrowRight
          :size="18"
          class="mt-1 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </NuxtLink>
    </div>
  </div>
</template>
