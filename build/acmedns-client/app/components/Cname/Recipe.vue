<script setup lang="ts">
import { PhCopy as Copy } from '@phosphor-icons/vue'
import { challengeName, zoneCnameLine } from '~/utils/domain'

const { domain, fulldomain } = defineProps<{
  domain: string
  fulldomain: string
}>()

const { copyText } = useClipboardCopy()
const host = computed(() => challengeName(domain))
const target = computed(() => fulldomain.replace(/\.$/, ''))
const zoneLine = computed(() => zoneCnameLine(domain, fulldomain))
</script>

<template>
  <section class="border-l-4 border-signal bg-panel p-4" style="border-radius: var(--radius-panel)">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold tracking-tight">CNAME to publish</h2>
        <p class="mt-1 max-w-[65ch] text-sm text-muted">
          Put this on the real DNS for {{ domain }}. Let's Encrypt follows it to acme-dns. Click a line to copy it.
          Nested names need their own <span class="font-mono">_acme-challenge.&lt;host&gt;</span> CNAME; reuse this fulldomain when they share the certificate.
        </p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-[6px] bg-signal px-3 py-2 text-sm text-signal-ink active:scale-[0.98]"
        @click="copyText(zoneLine, 'Zone line')"
      >
        <Copy :size="16" weight="regular" />
        Copy zone line
      </button>
    </div>
    <div class="mt-4 space-y-2 font-mono text-sm">
      <button
        type="button"
        class="block w-full truncate rounded-[4px] bg-paper px-3 py-2 text-left hover:bg-paper/70"
        @click="copyText(host, 'CNAME name')"
      >
        {{ host }}
      </button>
      <p class="px-3 text-muted">IN CNAME</p>
      <button
        type="button"
        class="block w-full truncate rounded-[4px] bg-paper px-3 py-2 text-left hover:bg-paper/70"
        @click="copyText(target, 'CNAME target')"
      >
        {{ target }}
      </button>
    </div>
  </section>
</template>
