<script setup lang="ts">
import type { ConfigLogView } from '#shared/types/appSettings'

defineProps<{
  logconfig: ConfigLogView
  pending: boolean
}>()
</script>

<template>
  <UiPanel id="settings-logconfig" class="scroll-mt-20 lg:scroll-mt-6">
    <h2 class="text-base font-semibold tracking-tight">Logging — [logconfig]</h2>
    <div class="mt-4 grid gap-4 md:grid-cols-3">
      <UiField label="loglevel">
        <UiInput v-model="logconfig.loglevel" mono :disabled="pending" />
      </UiField>
      <UiField label="logtype">
        <UiInput v-model="logconfig.logtype" mono :disabled="pending" />
      </UiField>
      <UiField label="logformat">
        <UiInput v-model="logconfig.logformat" mono :disabled="pending" />
      </UiField>
    </div>
  </UiPanel>
</template>
