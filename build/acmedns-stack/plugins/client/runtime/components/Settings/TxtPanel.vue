<script setup lang="ts">
import type { OperatorSettingsView, SettingSource } from '#shared/types/appSettings'

defineProps<{
  operator: OperatorSettingsView
  sharedMode: boolean
  pending: boolean
  sourceLabel: (source: SettingSource | undefined) => string
}>()
</script>

<template>
  <UiPanel id="settings-txt" class="scroll-mt-20 lg:scroll-mt-6" accent>
    <h2 class="text-base font-semibold tracking-tight">Challenge TXT timing</h2>
    <p class="mt-1 text-sm text-muted">
      Store lifetime = settle + hold. Dashboard overrides win over compose
      <span class="font-mono text-ink">ACME_TXT_SETTLE_MS</span> /
      <span class="font-mono text-ink">ACME_TXT_HOLD_MS</span>.
    </p>
    <div class="mt-4 grid gap-4 md:grid-cols-2">
      <UiField
        label="ACME_TXT_SETTLE_MS"
        :hint="`${sourceLabel(operator.sources.acmeTxtSettleMs)} · pause after TXT online before LE validate (0 disables)`"
      >
        <UiInput
          :model-value="String(operator.acmeTxtSettleMs)"
          mono
          :disabled="pending"
          @update:model-value="operator.acmeTxtSettleMs = Math.max(0, Number($event) || 0)"
        />
      </UiField>
      <UiField
        label="ACME_TXT_HOLD_MS"
        :hint="`${sourceLabel(operator.sources.acmeTxtHoldMs)} · extra TXT retention after settle`"
      >
        <UiInput
          :model-value="String(operator.acmeTxtHoldMs)"
          mono
          :disabled="pending"
          @update:model-value="operator.acmeTxtHoldMs = Math.max(1, Number($event) || 1)"
        />
      </UiField>
    </div>
    <label
      v-if="sharedMode"
      class="mt-4 flex items-start gap-2 text-sm text-ink"
    >
      <input
        v-model="operator.authHop"
        type="checkbox"
        class="mt-0.5 accent-[var(--signal)]"
        :disabled="pending"
      >
      <span>
        ACMEDNS_AUTH_HOP — per-authorization UUID CNAME hop
        <span class="block text-xs text-muted">
          Point Cloudflare at <span class="font-mono">any-label.auth.zone</span>; this server answers
          that label → fresh UUID (TXT only on the UUID). ({{ sourceLabel(operator.sources.authHop) }})
        </span>
      </span>
    </label>
  </UiPanel>
</template>
