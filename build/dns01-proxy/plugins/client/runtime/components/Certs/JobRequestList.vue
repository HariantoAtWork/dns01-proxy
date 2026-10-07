<script setup lang="ts">
import { computed } from 'vue'
import type { AcmeRequestItem } from '#shared/types/certs'
import { sortAcmeRequestItems } from '#shared/utils/acmeIssueSteps'
import { acmeRequestStatusClass, acmeRequestStatusLabel } from '#shared/utils/jobProgress'

const props = defineProps<{
  requests: AcmeRequestItem[]
  certName?: string
  nested?: boolean
}>()

const displayRequests = computed(() => {
  if (!props.certName) {
    return props.requests
  }
  return sortAcmeRequestItems(props.requests, props.certName)
})
</script>

<template>
  <ul
    class="space-y-1"
    :class="nested
      ? 'ml-2 border-l border-rule pl-2'
      : 'mt-2 border-t border-rule pt-2'"
  >
    <li
      v-for="item in displayRequests"
      :key="item.id"
    >
      <CertsStepLeaderRow
        :label="item.label"
        :status="acmeRequestStatusLabel(item.status)"
        :status-class="acmeRequestStatusClass(item.status)"
      />
    </li>
  </ul>
</template>
