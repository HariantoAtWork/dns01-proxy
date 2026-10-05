<script setup lang="ts">
import type { OperatorSettingsView, SettingSource } from '#shared/types/appSettings'

defineProps<{
  operator: OperatorSettingsView
  paths: { appSettings: string }
  sharedMode: boolean
  pending: boolean
  sourceLabel: (source: SettingSource | undefined) => string
}>()
</script>

<template>
  <UiPanel id="settings-operator" class="scroll-mt-20 lg:scroll-mt-6" accent>
    <h2 class="text-base font-semibold tracking-tight">Operator (compose / env)</h2>
    <p class="mt-1 text-sm text-muted">
      Overrides live in <span class="font-mono text-ink">{{ paths.appSettings || 'client/app-settings.json' }}</span>.
    </p>
    <div class="mt-4 grid gap-4 md:grid-cols-2">
      <UiField label="ACMEDNS_URL" :hint="sourceLabel(operator.sources.acmednsUrl)">
        <UiInput v-model="operator.acmednsUrl" mono :disabled="pending" />
      </UiField>
      <UiField
        v-if="!sharedMode"
        label="Register default URL"
        :hint="sourceLabel(operator.sources.defaultAcmednsUrl)"
      >
        <UiInput v-model="operator.defaultAcmednsUrl" mono :disabled="pending" />
      </UiField>
      <UiField label="LETSENCRYPT_EMAIL" :hint="sourceLabel(operator.sources.letsencryptEmail)">
        <UiInput v-model="operator.letsencryptEmail" :disabled="pending" />
      </UiField>
      <UiField label="RENEW_INTERVAL (hours)" :hint="sourceLabel(operator.sources.renewInterval)">
        <UiInput
          :model-value="String(operator.renewInterval)"
          mono
          :disabled="pending"
          @update:model-value="operator.renewInterval = Math.max(1, Number($event) || 12)"
        />
      </UiField>
      <UiField label="TZ" :hint="sourceLabel(operator.sources.tz)">
        <UiInput v-model="operator.tz" mono :disabled="pending" />
      </UiField>
      <UiField
        label="ADMINISTRATOR_PASSWORD"
        :hint="`${sourceLabel(operator.sources.administratorPassword)}${operator.passwordSet ? ' · password is set' : ' · open access'}`"
      >
        <UiPasswordInput
          v-model="operator.administratorPassword"
          :disabled="pending"
          placeholder="Leave blank to keep current"
        />
      </UiField>
    </div>
    <label class="mt-4 flex items-start gap-2 text-sm text-ink">
      <input v-model="operator.certsAcmeDisabled" type="checkbox" class="mt-0.5 accent-[var(--signal)]" :disabled="pending">
      <span>
        CERTS_ACME_DISABLED — block production issue/renew
        <span class="block text-xs text-muted">
          Staging Apply still works. ({{ sourceLabel(operator.sources.certsAcmeDisabled) }})
        </span>
      </span>
    </label>
    <label class="mt-3 flex items-start gap-2 text-sm text-ink">
      <input v-model="operator.certsRenewDisabled" type="checkbox" class="mt-0.5 accent-[var(--signal)]" :disabled="pending">
      <span>
        CERTS_RENEW_DISABLED — stop the renew scheduler only
        <span class="block text-xs text-muted">
          Periodic production renew off. Manual Apply / Force re-issue still work.
          ({{ sourceLabel(operator.sources.certsRenewDisabled) }})
        </span>
      </span>
    </label>
  </UiPanel>
</template>
