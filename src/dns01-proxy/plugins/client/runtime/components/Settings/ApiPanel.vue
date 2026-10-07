<script setup lang="ts">
import type { ConfigApiView } from '#shared/types/appSettings'

defineProps<{
  api: ConfigApiView
  pending: boolean
}>()
</script>

<template>
  <UiPanel id="settings-api" class="scroll-mt-20 lg:scroll-mt-6">
    <h2 class="text-base font-semibold tracking-tight">API — [api]</h2>
    <p v-if="api.shared_mode" class="mt-1 text-sm text-muted">
      Registration stays disabled while Tiny mode is on.
    </p>
    <div class="mt-4 grid gap-4 md:grid-cols-2">
      <UiField label="ip">
        <UiInput v-model="api.ip" mono :disabled="pending" />
      </UiField>
      <UiField label="port">
        <UiInput v-model="api.port" mono :disabled="pending" />
      </UiField>
      <UiField label="tls" hint='Use "none" behind Cloudflare; "cert" needs PEM paths below'>
        <UiInput v-model="api.tls" mono :disabled="pending" />
      </UiField>
      <UiField label="header_name">
        <UiInput v-model="api.header_name" mono :disabled="pending" />
      </UiField>
      <UiField
        class="md:col-span-2"
        label="tls_cert_fullchain"
        hint="Container path — only when tls = cert"
      >
        <UiInput v-model="api.tls_cert_fullchain" mono :disabled="pending || api.tls !== 'cert'" />
      </UiField>
      <UiField
        class="md:col-span-2"
        label="tls_cert_privkey"
        hint="Container path — only when tls = cert"
      >
        <UiInput v-model="api.tls_cert_privkey" mono :disabled="pending || api.tls !== 'cert'" />
      </UiField>
      <label
        v-if="!api.shared_mode"
        class="flex items-center gap-2 text-sm text-ink"
      >
        <input v-model="api.disable_registration" type="checkbox" class="accent-[var(--signal)]" :disabled="pending">
        disable_registration
      </label>
      <label class="flex items-center gap-2 text-sm text-ink">
        <input v-model="api.use_header" type="checkbox" class="accent-[var(--signal)]" :disabled="pending">
        use_header
      </label>
    </div>
    <UiField class="mt-4" label="corsorigins" hint="Comma or newline separated">
      <textarea
        v-model="api.corsorigins"
        class="min-h-[72px] w-full resize-y rounded-[6px] border border-rule bg-paper p-3 font-mono text-sm text-ink outline-none focus:border-signal"
        spellcheck="false"
        :disabled="pending"
      />
    </UiField>
  </UiPanel>
</template>
