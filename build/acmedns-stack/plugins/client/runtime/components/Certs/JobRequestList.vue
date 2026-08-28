<script setup lang="ts">
import type { AcmeRequestItem } from '#shared/types/certs'
import { acmeRequestStatusLabel } from '#shared/utils/jobProgress'

defineProps<{
  requests: AcmeRequestItem[]
  nested?: boolean
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
  <ul
    class="space-y-1"
    :class="nested
      ? 'ml-2 border-l border-rule pl-2'
      : 'mt-2 border-t border-rule pt-2'"
  >
    <li
      v-for="item in requests"
      :key="item.id"
    >
      <CertsStepLeaderRow
        :label="item.label"
        :status="acmeRequestStatusLabel(item.status)"
        :status-class="statusClass(item.status)"
      />
    </li>
  </ul>
</template>
