<script setup lang="ts">
import type { ConfigGeneralView } from '#shared/types/appSettings'

defineProps<{
  general: ConfigGeneralView
  paths: { configCfg: string }
  sharedMode: boolean
  pending: boolean
}>()
</script>

<template>
  <UiPanel id="settings-general" class="scroll-mt-20 lg:scroll-mt-6">
    <h2 class="text-base font-semibold tracking-tight">Auth DNS — config.cfg [general]</h2>
    <p class="mt-1 font-mono text-xs text-muted">{{ paths.configCfg }}</p>
    <p v-if="sharedMode" class="mt-2 text-sm text-muted">
      Auth zone, nsname, and glue records are managed by Tiny mode above — not edited here.
    </p>
    <div class="mt-4 grid gap-4 md:grid-cols-2">
      <UiField label="listen">
        <UiInput v-model="general.listen" mono :disabled="pending" />
      </UiField>
      <UiField label="protocol">
        <UiInput v-model="general.protocol" mono :disabled="pending" />
      </UiField>
      <UiField
        v-if="!sharedMode"
        label="domain"
      >
        <UiInput v-model="general.domain" mono :disabled="pending" />
      </UiField>
      <UiField
        v-if="!sharedMode"
        label="nsname"
      >
        <UiInput v-model="general.nsname" mono :disabled="pending" />
      </UiField>
      <UiField label="nsadmin">
        <UiInput v-model="general.nsadmin" mono :disabled="pending" />
      </UiField>
      <label class="flex items-center gap-2 self-end text-sm text-ink">
        <input v-model="general.debug" type="checkbox" class="accent-[var(--signal)]" :disabled="pending">
        debug
      </label>
    </div>
    <UiField
      v-if="!sharedMode"
      class="mt-4"
      label="records"
      hint="One DNS record line per row"
    >
      <textarea
        v-model="general.records"
        class="min-h-[120px] w-full resize-y rounded-[6px] border border-rule bg-paper p-3 font-mono text-sm text-ink outline-none focus:border-signal"
        spellcheck="false"
        :disabled="pending"
      />
    </UiField>
  </UiPanel>
</template>
