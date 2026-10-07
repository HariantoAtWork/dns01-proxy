<script setup lang="ts">
import type { ConfigDatabaseView } from '#shared/types/appSettings'

defineProps<{
  database: ConfigDatabaseView
  pending: boolean
}>()
</script>

<template>
  <UiPanel id="settings-database" class="scroll-mt-20 lg:scroll-mt-6">
    <h2 class="text-base font-semibold tracking-tight">Database — [database]</h2>
    <div class="mt-4 grid gap-4 md:grid-cols-2">
      <UiField label="engine">
        <UiInput v-model="database.engine" mono :disabled="pending" />
      </UiField>
      <UiField label="connection">
        <UiInput v-model="database.connection" mono :disabled="pending" />
      </UiField>
    </div>
  </UiPanel>
</template>
