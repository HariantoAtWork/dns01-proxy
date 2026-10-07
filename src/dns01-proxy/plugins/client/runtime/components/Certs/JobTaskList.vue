<script setup lang="ts">
import type { CertJobTask } from '#shared/types/certs'
import { certJobTaskStatusClass, certJobTaskStatusLabel } from '#shared/utils/jobProgress'

defineProps<{
  tasks: CertJobTask[]
  compact?: boolean
}>()
</script>

<template>
  <ul
    class="w-full space-y-2"
    :class="compact
      ? 'border-0 pt-0'
      : 'mt-2 border-t border-rule pt-2'"
  >
    <li
      v-for="task in tasks"
      :key="task.id"
      class="space-y-1"
    >
      <CertsStepLeaderRow
        :label="task.certName"
        :status="certJobTaskStatusLabel(task.status)"
        :status-class="certJobTaskStatusClass(task.status)"
      />
      <p
        v-if="task.message"
        class="text-[10px] text-muted"
      >
        {{ task.message }}
      </p>
      <CertsJobRequestList
        v-if="task.requests?.length"
        nested
        :cert-name="task.certName"
        :requests="task.requests"
      />
    </li>
  </ul>
</template>
