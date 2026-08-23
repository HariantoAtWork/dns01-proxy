<script setup lang="ts">
import {
  nestedCnameExamples,
  parseNestedLabels,
} from '#client/utils/domain'

const {
  domain,
  fulldomain = '',
  open = false,
  title = 'Nested challenge CNAMEs',
  flush = false,
} = defineProps<{
  domain: string
  fulldomain?: string
  open?: boolean
  title?: string
  flush?: boolean
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
  <UiDisclosure :title :open :flush>
    <p class="max-w-[65ch] text-sm text-muted">
      Type a nested path (e.g. <span class="font-mono text-ink">oib</span> or
      <span class="font-mono text-ink">child.parent.grandparent</span>).
      Dotted paths expand to every parent Name you need to publish. Each points at
      <span class="font-mono text-ink">_acme-challenge.{{ apex }}</span>
      — not a second UUID. Commas separate multiple paths.
    </p>

    <UiField label="Nested label" :for="`nested-labels-${apex}`">
      <UiInput
        :id="`nested-labels-${apex}`"
        v-model="labelsInput"
        mono
        placeholder="oib or child.parent.grandparent"
        autocomplete="off"
        spellcheck="false"
      />
    </UiField>

    <p v-if="records.length === 0" class="text-sm text-muted">
      Start typing a label to get copyable Name strings and Content.
    </p>

    <div
      v-else
      class="flex flex-col gap-3 border-l-4 border-signal bg-paper p-1 md:p-4"
      style="border-radius: var(--radius-panel)"
    >
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
  </UiDisclosure>
</template>
