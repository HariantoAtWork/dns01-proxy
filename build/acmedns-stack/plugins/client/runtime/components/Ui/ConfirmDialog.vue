<script setup lang="ts">
const { title, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = defineProps<{
  title: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const open = defineModel<boolean>('open', { required: true })
const panel = useTemplateRef<HTMLElement>('panel')
/** Stays in the Vue tree (not teleported) so we can find a parent `<dialog>`. */
const anchor = useTemplateRef<HTMLElement>('anchor')
const titleId = useId()
/** `body` when standalone; nearest open dialog when nested in `UiModal`. */
const teleportTo = ref<HTMLElement | string>('body')
const showOverlay = ref(false)

watch(open, async (value) => {
  if (!value) {
    showOverlay.value = false
    teleportTo.value = 'body'
    return
  }
  await nextTick()
  // Native showModal() uses the top layer — a body teleport with z-index sits
  // underneath and looks like the confirm never opened (Register overwrite).
  const dialog = anchor.value?.closest('dialog')
  teleportTo.value = dialog instanceof HTMLElement ? dialog : 'body'
  showOverlay.value = true
  await nextTick()
  // Focus the panel so Enter/Space hit the confirm form, not a parent dialog control.
  panel.value?.querySelector<HTMLElement>('button[type="submit"]')?.focus()
})

function onCancel() {
  if (!open.value) {
    return
  }
  open.value = false
  emit('cancel')
}

function onConfirm() {
  // Emit before closing so parents that clear state via v-model still have context.
  emit('confirm')
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    onCancel()
  }
}
</script>

<template>
  <!--
    Overlay (not nested <dialog>) so Confirm can open above Register/Proxy modals
    without a second showModal() dismissing the parent.
    Teleport into the open dialog when nested so we stay in the top layer.
  -->
  <span ref="anchor" class="hidden" aria-hidden="true" />
  <Teleport :to="teleportTo">
    <div
      v-if="showOverlay"
      class="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 p-4"
      role="presentation"
      @click.self="onCancel"
      @keydown="onKeydown"
    >
      <div
        ref="panel"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        class="w-[min(28rem,calc(100vw-2rem))] border border-rule bg-panel p-0 text-ink shadow-[0_16px_40px_var(--shadow)]"
        style="border-radius: var(--radius-panel)"
        tabindex="-1"
        @click.stop
      >
        <form class="flex flex-col gap-4 p-5" @submit.prevent="onConfirm">
          <h2 :id="titleId" class="text-lg font-semibold tracking-tight">
            {{ title }}
          </h2>
          <div class="text-sm text-muted">
            <slot />
          </div>
          <div class="flex justify-end gap-2">
            <UiButton type="button" variant="ghost" @click="onCancel">
              {{ cancelLabel }}
            </UiButton>
            <UiButton type="submit" :variant="danger ? 'danger' : 'signal'">
              {{ confirmLabel }}
            </UiButton>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
