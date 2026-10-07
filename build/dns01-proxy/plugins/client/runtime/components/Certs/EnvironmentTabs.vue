<script setup lang="ts">
export type CertEnvironment = 'live' | 'staging'

const model = defineModel<CertEnvironment>({ required: true })

defineProps<{
  pending?: boolean
  liveAcmeOff?: boolean
}>()
</script>

<template>
  <div class="space-y-1">
    <div
      role="tablist"
      aria-label="Certificate environment"
      class="cert-env-switch relative grid w-full grid-cols-2 rounded-full border border-rule p-0.5"
    >
      <span
        class="pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-4px)] rounded-full bg-panel shadow-sm transition-transform duration-200 ease-out"
        :class="model === 'staging' && 'translate-x-[calc(100%+4px)]'"
        aria-hidden="true"
      />
      <button
        id="cert-tab-live"
        type="button"
        role="tab"
        :aria-selected="model === 'live'"
        aria-controls="cert-panel-live"
        class="relative z-[1] rounded-full px-2 py-1.5 text-center text-sm font-medium transition-colors"
        :class="model === 'live'
          ? 'font-semibold text-ink'
          : 'text-muted hover:text-ink'"
        :disabled="pending"
        @click="model = 'live'"
      >
        Live
      </button>
      <button
        id="cert-tab-staging"
        type="button"
        role="tab"
        :aria-selected="model === 'staging'"
        aria-controls="cert-panel-staging"
        class="relative z-[1] rounded-full px-2 py-1.5 text-center text-sm font-medium transition-colors"
        :class="model === 'staging'
          ? 'font-semibold text-ink'
          : 'text-muted hover:text-ink'"
        :disabled="pending"
        @click="model = 'staging'"
      >
        Staging
      </button>
    </div>
    <p
      v-if="model === 'live' && liveAcmeOff"
      class="text-[11px] leading-tight text-danger"
    >
      Live ACME off
    </p>
  </div>
</template>

<style scoped>
.cert-env-switch {
  background: transparent;
}

@media (prefers-color-scheme: dark) {
  .cert-env-switch {
    background: color-mix(in srgb, #000 40%, transparent);
  }
}
</style>
