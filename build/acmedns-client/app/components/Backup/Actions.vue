<script setup lang="ts">
import { PhArchive as Archive, PhFloppyDisk as FloppyDisk } from '@phosphor-icons/vue'

const { domains, pending = false } = defineProps<{
  domains: string[]
  pending?: boolean
}>()

const selectedDomain = defineModel<string>('domain', { required: true })

const emit = defineEmits<{
  full: []
  domain: []
}>()
</script>

<template>
  <div class="grid gap-4 md:grid-cols-2">
    <section class="flex flex-col gap-3 border border-rule bg-panel p-4" style="border-radius: var(--radius-panel)">
      <h2 class="text-base font-semibold">Full dump</h2>
      <p class="text-sm text-muted">
        Copy the live <span class="font-mono text-ink">clientstorage.json</span> into the backup folder. Restore replaces the whole file.
      </p>
      <button
        type="button"
        class="mt-auto inline-flex w-fit items-center gap-2 rounded-[6px] bg-signal px-3 py-2 text-sm text-signal-ink disabled:opacity-50 active:scale-[0.98]"
        :disabled="pending"
        @click="emit('full')"
      >
        <Archive :size="16" weight="regular" aria-hidden="true" />
        Backup all hostnames
      </button>
    </section>

    <section class="flex flex-col gap-3 border border-rule bg-panel p-4" style="border-radius: var(--radius-panel)">
      <h2 class="text-base font-semibold">One hostname</h2>
      <p class="text-sm text-muted">
        Write one stored credentials object. Restore merges that hostname back; you will confirm if it already exists.
      </p>
      <label class="flex flex-col gap-2 text-sm font-medium" for="backup-domain">
        Hostname
        <select
          id="backup-domain"
          v-model="selectedDomain"
          class="border border-rule bg-paper px-3 py-2 font-mono text-sm font-normal"
          style="border-radius: var(--radius-input)"
          :disabled="pending || !domains.length"
        >
          <option v-if="!domains.length" value="">
            No hostnames in live storage
          </option>
          <option v-for="host in domains" :key="host" :value="host">
            {{ host }}
          </option>
        </select>
      </label>
      <button
        type="button"
        class="inline-flex w-fit items-center gap-2 rounded-[6px] border border-rule px-3 py-2 text-sm hover:bg-paper disabled:opacity-50 active:scale-[0.98]"
        :disabled="pending || !selectedDomain"
        @click="emit('domain')"
      >
        <FloppyDisk :size="16" weight="regular" aria-hidden="true" />
        Backup this hostname
      </button>
    </section>
  </div>
</template>
