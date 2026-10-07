<script setup lang="ts">
import { PhX as Close } from '@phosphor-icons/vue'
import { claimUiModal, releaseUiModal } from '../../utils/uiModalExclusive'

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

function dismiss() {
  open.value = false
}

watch(open, async (value) => {
  await nextTick()
  const el = dialog.value
  if (!el) {
    return
  }
  if (value) {
    // Close any other UiModal first — a second showModal() can dismiss the
    // previous <dialog>, and reopening it from @close stacked both panels.
    const other = claimUiModal(dismiss)
    if (other) {
      other()
      await nextTick()
    }
    if (!el.open) {
      el.showModal()
    }
    return
  }
  releaseUiModal(dismiss)
  if (el.open) {
    el.close()
  }
})

function onCancel() {
  open.value = false
}

function onClose() {
  // Keep v-model in sync when the browser closes this dialog (Esc, or another modal).
  if (open.value) {
    open.value = false
  }
  releaseUiModal(dismiss)
}

/**
 * Only treat real backdrop hits as dismiss.
 * Geometry checks break when tab/content height changes under a touch/click
 * (delayed click lands “outside” the shrunken panel and closes the modal).
 */
function onBackdropClick(event: MouseEvent) {
  if (event.target === dialog.value) {
    open.value = false
  }
}
</script>

<template>
  <dialog
    :id
    ref="dialog"
    class="m-auto max-h-[calc(100dvh-2rem)] border border-rule bg-panel p-0 text-ink shadow-[0_16px_40px_var(--shadow)] backdrop:bg-ink/40 open:flex open:flex-col open:overflow-hidden"
    :class="widthClass"
    style="border-radius: var(--radius-panel)"
    :aria-labelledby="titleId"
    @cancel="onCancel"
    @close="onClose"
    @click="onBackdropClick"
  >
    <!-- stopPropagation so panel clicks never count as backdrop (target === dialog). -->
    <div
      class="flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col overflow-hidden"
      :class="size === 'lg' && 'min-h-[min(24rem,calc(100dvh-2rem))]'"
      @click.stop
    >
      <div class="flex shrink-0 items-start justify-between gap-3 border-b border-rule px-5 py-4">
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
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        <slot />
      </div>
    </div>
  </dialog>
</template>

<style scoped>
/* Never let utility display classes override the closed-dialog hide rule. */
dialog:not([open]) {
  display: none !important;
}
</style>
