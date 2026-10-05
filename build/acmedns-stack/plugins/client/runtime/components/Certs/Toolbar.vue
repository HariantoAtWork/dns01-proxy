<script setup lang="ts">
import type { LetsEncryptDirectoryMode } from '#shared/types/certs'
import { PhGear as Gear } from '@phosphor-icons/vue'

type CertEnvironment = 'live' | 'staging'

const {
  pending = false,
  configOpen = false,
  directoryMode,
  acmeEnabled = true,
} = defineProps<{
  pending?: boolean
  configOpen?: boolean
  directoryMode: LetsEncryptDirectoryMode
  acmeEnabled?: boolean
}>()

const certEnvironment = defineModel<CertEnvironment>({ required: true })

const emit = defineEmits<{
  'update:configOpen': [open: boolean]
}>()
</script>

<template>
  <div
    class="sticky top-12 z-[15] -mx-1 flex items-stretch gap-2 bg-paper/95 px-1 py-1 backdrop-blur-md md:top-16 md:-mx-6 md:px-6"
  >
    <button
      type="button"
      class="inline-flex shrink-0 items-center justify-center rounded-full p-1.5 transition-colors"
      :class="configOpen ? 'text-ink' : 'text-muted hover:text-ink'"
      aria-label="Edit domains.txt"
      title="domains.txt and DNS checks"
      :disabled="pending"
      @click="emit('update:configOpen', true)"
    >
      <Gear :size="18" weight="regular" aria-hidden="true" />
    </button>
    <CertsEnvironmentTabs
      v-model="certEnvironment"
      class="min-w-0 flex-1"
      :pending="pending"
      :live-acme-off="directoryMode === 'production' && !acmeEnabled"
    />
  </div>
</template>
