<script setup lang="ts">
import type { CertRateLimit } from '#shared/types/certs'
import { rateLimitLabel } from '#shared/utils/certsUi'

const { limits, nowMs } = defineProps<{
  limits: CertRateLimit[]
  nowMs: number
}>()
</script>

<template>
  <UiPanel v-if="limits.length">
    <h2 class="text-sm font-semibold text-danger">
      Let's Encrypt rate limit
    </h2>
    <p class="mt-1 text-xs text-muted">
      Cooldown from HTTP 429 / Retry-After. Stored on disk so it survives refresh and reboot.
    </p>
    <ul class="mt-3 space-y-2 font-mono text-xs">
      <li
        v-for="limit in limits"
        :key="limit.id"
        class="rounded-[6px] border border-danger/30 px-3 py-2 text-danger"
      >
        <ClientOnly>
          <p>{{ rateLimitLabel(limit, nowMs) }}</p>
          <template #fallback>
            <p>…</p>
          </template>
        </ClientOnly>
        <p v-if="limit.detail" class="mt-1 text-[11px] text-muted">
          {{ limit.detail }}
          <span v-if="limit.endpoint"> · {{ limit.endpoint }}</span>
        </p>
      </li>
    </ul>
  </UiPanel>
</template>
