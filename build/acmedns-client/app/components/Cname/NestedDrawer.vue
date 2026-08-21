<script setup lang="ts">
import { PhCaretDown as CaretDown } from '@phosphor-icons/vue'
import {
  nestedCnameExamples,
  parseNestedLabels,
} from '~/utils/domain'

const {
  domain,
  fulldomain = '',
  open = false,
  title = 'Nested challenge CNAMEs',
} = defineProps<{
  domain: string
  fulldomain?: string
  open?: boolean
  title?: string
}>()

const { copyText } = useClipboardCopy()

const labelsInput = ref('')

const apex = computed(() => {
  const value = domain.trim()
  return value || 'example.com'
})

const labels = computed(() => parseNestedLabels(labelsInput.value))
const records = computed(() => nestedCnameExamples(apex.value, labels.value))
const content = computed(() => records.value[0]?.target ?? `_acme-challenge.${apex.value}`)
const nestedPaths = computed(() => records.value.map(record =>
  record.host.endsWith(`.${apex.value}`)
    ? record.host.slice(0, -(apex.value.length + 1))
    : record.host,
))
const chainFulldomain = computed(() => {
  const value = fulldomain.trim().replace(/\.$/, '')
  return value || '<fulldomain>'
})
</script>

<template>
  <details
    class="group border border-rule bg-panel"
    style="border-radius: var(--radius-panel)"
    :open="open || undefined"
  >
    <summary
      class="flex cursor-pointer list-none items-center justify-between gap-2 px-1 py-1 text-sm font-medium text-ink marker:content-none md:gap-3 md:px-4 md:py-3 [&::-webkit-details-marker]:hidden"
    >
      <span>{{ title }}</span>
      <CaretDown
        :size="16"
        weight="bold"
        class="shrink-0 text-muted transition-transform group-open:rotate-180"
        aria-hidden="true"
      />
    </summary>

    <div class="space-y-3 border-t border-rule px-1 py-1 md:space-y-4 md:px-4 md:py-4">
      <p class="max-w-[65ch] text-sm text-muted">
        Type a nested path (e.g. <span class="font-mono text-ink">oib</span> or
        <span class="font-mono text-ink">child.parent.grandparent</span>).
        Dotted paths expand to every parent Name you need to publish. Each points at
        <span class="font-mono text-ink">_acme-challenge.{{ apex }}</span>
        — not a second UUID. Commas separate multiple paths.
      </p>

      <div class="flex flex-col gap-2">
        <label :for="`nested-labels-${apex}`" class="text-sm font-medium">Nested label</label>
        <input
          :id="`nested-labels-${apex}`"
          v-model="labelsInput"
          class="border border-rule bg-paper px-3 py-2 font-mono text-sm"
          style="border-radius: var(--radius-input)"
          placeholder="oib or child.parent.grandparent"
          autocomplete="off"
          spellcheck="false"
        >
      </div>

      <p v-if="records.length === 0" class="text-sm text-muted">
        Start typing a label to get copyable Name strings and Content.
      </p>

      <div v-else class="flex flex-col gap-3 border-l-4 border-signal bg-paper p-4" style="border-radius: var(--radius-panel)">
        <dl class="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-3 font-mono text-sm">
          <dt class="text-xs uppercase tracking-wide text-muted">Name</dt>
          <dd class="flex min-w-0 flex-col gap-2">
            <div v-for="record in records" :key="record.host" class="min-w-0">
              <button
                type="button"
                class="block max-w-full cursor-copy truncate text-left text-ink hover:text-signal"
                :title="record.cloudflareName"
                @click="copyText(record.cloudflareName, 'Name')"
              >
                {{ record.cloudflareName }}
              </button>
              <p class="mt-0.5 font-sans text-xs text-muted">*.{{ record.host }}</p>
            </div>
            <p class="font-sans text-xs text-muted">In zone {{ apex }}</p>
          </dd>

          <dt class="text-xs uppercase tracking-wide text-muted">Content</dt>
          <dd>
            <button
              type="button"
              class="block max-w-full cursor-copy truncate text-left text-ink hover:text-signal"
              :title="content"
              @click="copyText(content, 'Content')"
            >
              {{ content }}
            </button>
            <p class="mt-0.5 font-sans text-xs text-muted">Same for every Name · DNS only</p>
          </dd>
        </dl>
      </div>

      <CnameChain
        v-if="records.length > 0"
        :apex
        :fulldomain="chainFulldomain"
        :nested="nestedPaths"
      />
    </div>
  </details>
</template>
