<script setup lang="ts">
import { Codemirror } from 'vue-codemirror'
import { EditorView, lineNumbers } from '@codemirror/view'
import { PhTextAlignJustify as TextAlignJustify } from '@phosphor-icons/vue'
import { acmednsCodeMirrorTheme } from '#client/utils/codemirrorTheme'

const model = defineModel<string>({ required: true })

const { disabled = false, minHeight = '220px' } = defineProps<{
  disabled?: boolean
  minHeight?: string
}>()

const wrap = ref(true)

const extensions = computed(() => [
  lineNumbers(),
  acmednsCodeMirrorTheme,
  EditorView.editable.of(!disabled),
  EditorView.contentAttributes.of({ spellcheck: 'false' }),
  ...(wrap.value ? [EditorView.lineWrapping] : []),
])
</script>

<template>
  <ClientOnly>
    <div
      class="line-numbered-editor flex flex-col overflow-hidden rounded-[6px] border border-rule bg-paper focus-within:border-signal"
      :style="{ minHeight }"
    >
      <div class="flex shrink-0 justify-end border-b border-rule bg-panel/80 px-2 py-1">
        <button
          type="button"
          class="inline-flex items-center justify-center rounded-[6px] border border-rule bg-paper p-1.5 text-ink transition-colors hover:bg-panel disabled:opacity-50"
          :class="wrap && 'border-signal/40 text-signal'"
          :aria-pressed="wrap"
          :aria-label="wrap ? 'Disable line wrap' : 'Enable line wrap'"
          :title="wrap ? 'Disable line wrap' : 'Enable line wrap'"
          :disabled="disabled"
          @click="wrap = !wrap"
        >
          <TextAlignJustify :size="14" weight="regular" aria-hidden="true" />
        </button>
      </div>
      <div class="min-h-0 flex-1">
        <Codemirror
          v-model="model"
          :extensions="extensions"
          :disabled="disabled"
          :indent-with-tab="false"
          :style="{ height: '100%', minHeight: `calc(${minHeight} - 2.5rem)` }"
        />
      </div>
    </div>
    <template #fallback>
      <textarea
        :value="model"
        class="min-h-[220px] w-full resize-y rounded-[6px] border border-rule bg-paper p-3 font-mono text-sm text-ink outline-none"
        :style="{ minHeight }"
        spellcheck="false"
        readonly
        aria-hidden="true"
      />
    </template>
  </ClientOnly>
</template>

<style scoped>
.line-numbered-editor {
  resize: vertical;
  min-height: 220px;
}

.line-numbered-editor :deep(.cm-editor) {
  height: 100%;
  min-height: inherit;
}

.line-numbered-editor :deep(.cm-scroller) {
  min-height: inherit;
}
</style>
