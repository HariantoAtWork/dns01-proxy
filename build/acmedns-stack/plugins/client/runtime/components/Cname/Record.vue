<script setup lang="ts">
import { PhCopy as Copy } from '@phosphor-icons/vue'
import type { CnameExample } from '#client/utils/domain'

const { record, zone } = defineProps<{
  record: CnameExample
  zone: string
}>()

const { copyText } = useClipboardCopy()

const zoneLine = computed(() => `${record.name}. IN CNAME ${record.target}.`)
</script>

<template>
  <article class="border border-rule bg-paper p-1 md:p-3" style="border-radius: var(--radius-input)">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <p class="text-sm text-muted">
        Covers <span class="font-mono text-ink">{{ record.covers }}</span>
      </p>
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-[4px] px-2 py-1 text-xs text-muted hover:bg-panel hover:text-ink"
        @click="copyText(zoneLine, 'Zone line', $event)"
      >
        <Copy :size="14" weight="regular" />
        Copy
      </button>
    </div>

    <dl class="mt-3 grid grid-cols-[7rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 font-mono text-sm">
      <dt class="text-xs uppercase tracking-wide text-muted">Type</dt>
      <dd class="text-ink">CNAME</dd>

      <dt class="text-xs uppercase tracking-wide text-muted">Name</dt>
      <dd>
        <UiCopyable :value="record.name" label="Name" />
        <p class="mt-0.5 font-sans text-xs text-muted">
          Full DNS name · Cloudflare Name in zone {{ zone }}:
          <UiCopyable inline :value="record.cloudflareName" label="Cloudflare Name" />
        </p>
      </dd>

      <dt class="text-xs uppercase tracking-wide text-muted">Content</dt>
      <dd>
        <UiCopyable :value="record.target" label="Content" />
      </dd>

      <dt class="text-xs uppercase tracking-wide text-muted">Proxy</dt>
      <dd class="font-sans text-ink">DNS only</dd>
    </dl>
  </article>
</template>
