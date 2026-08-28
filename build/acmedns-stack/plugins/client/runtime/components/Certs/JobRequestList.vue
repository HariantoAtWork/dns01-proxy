<script setup lang="ts">
import type { AcmeRequestItem } from '#shared/types/certs'
import { acmeRequestStatusLabel } from '#shared/utils/jobProgress'

defineProps<{
  requests: AcmeRequestItem[]
}>()

function statusClass(status: AcmeRequestItem['status']) {
  switch (status) {
    case 'done':
      return 'text-signal'
    case 'running':
      return 'text-live font-semibold'
    case 'failed':
      return 'text-danger'
    default:
      return 'text-muted'
  }
}
</script>

<template>
  <ul class="mt-2 space-y-1 border-t border-rule pt-2">
    <li
      v-for="item in requests"
      :key="item.id"
      class="flex items-start justify-between gap-2"
    >
      <span :class="statusClass(item.status)">
        {{ item.label }}
      </span>
      <span class="shrink-0 uppercase tracking-wide" :class="statusClass(item.status)">
        {{ acmeRequestStatusLabel(item.status) }}
      </span>
    </li>
  </ul>
</template>
