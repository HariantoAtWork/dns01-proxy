<script setup lang="ts">
import { PhX as Close } from '@phosphor-icons/vue'

const { title, id, size = 'md' } = defineProps<{
  title: string
  id?: string
  size?: 'md' | 'lg'
}>()

const widthClass = computed(() =>
  size === 'lg'
    ? 'w-[min(42rem,calc(100vw-2rem))]'
    : 'w-[min(36rem,calc(100vw-2rem))]',
)

const open = defineModel<boolean>('open', { required: true })
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const titleId = useId()

watch(open, (value) => {
  const el = dialog.value
  if (!el) {
    return
  }
  if (value && !el.open) {
    el.showModal()
  }
  if (!value && el.open) {
    el.close()
  }
})

function onClose() {
  open.value = false
}

function onBackdropClick(event: MouseEvent) {
  const el = dialog.value
  if (!el) {
    return
  }
  const rect = el.getBoundingClientRect()
  const inside = event.clientX >= rect.left
    && event.clientX <= rect.right
    && event.clientY >= rect.top
    && event.clientY <= rect.bottom
  if (!inside) {
    open.value = false
  }
}
</script>

<template>
  <dialog
    :id
    ref="dialog"
    class="m-auto max-h-[calc(100dvh-2rem)] border border-rule bg-panel p-0 text-ink shadow-[0_16px_40px_var(--shadow)] backdrop:bg-ink/40"
    :class="widthClass"
    style="border-radius: var(--radius-panel)"
    :aria-labelledby="titleId"
    @close="onClose"
    @click="onBackdropClick"
  >
    <div class="flex items-start justify-between gap-3 border-b border-rule px-5 py-4">
      <h2 :id="titleId" class="text-lg font-semibold tracking-tight">
        {{ title }}
      </h2>
      <div class="flex items-center gap-2">
        <slot name="actions" />
        <button
          type="button"
          class="inline-flex items-center rounded-[6px] border border-rule p-2 text-muted hover:bg-paper hover:text-ink"
          aria-label="Close"
          @click="open = false"
        >
          <Close :size="16" weight="regular" aria-hidden="true" />
        </button>
      </div>
    </div>
    <div class="max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain px-5 py-4">
      <slot />
    </div>
  </dialog>
</template>
