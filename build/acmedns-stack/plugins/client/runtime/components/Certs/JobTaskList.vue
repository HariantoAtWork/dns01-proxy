<script setup lang="ts">
import type { CertJobTask } from '#shared/types/certs'
import { certJobTaskStatusLabel } from '#shared/utils/jobProgress'

defineProps<{
  tasks: CertJobTask[]
}>()

function taskStatusClass(status: CertJobTask['status']) {
  switch (status) {
    case 'done':
      return 'text-signal'
    case 'running':
      return 'text-live font-semibold'
    case 'failed':
      return 'text-danger'
    case 'skipped':
      return 'text-muted'
    default:
      return 'text-muted'
  }
}
</script>

<template>
  <ul class="mt-2 w-full space-y-2 border-t border-rule pt-2">
    <li
      v-for="task in tasks"
      :key="task.id"
      class="space-y-1"
    >
      <div class="flex items-start justify-between gap-2">
        <span :class="taskStatusClass(task.status)">
          {{ task.certName }}
        </span>
        <span
          class="shrink-0 uppercase tracking-wide"
          :class="taskStatusClass(task.status)"
        >
          {{ certJobTaskStatusLabel(task.status) }}
        </span>
      </div>
      <p
        v-if="task.message"
        class="text-[10px] text-muted"
      >
        {{ task.message }}
      </p>
      <CertsJobRequestList
        v-if="task.requests?.length"
        nested
        :requests="task.requests"
      />
    </li>
  </ul>
</template>
