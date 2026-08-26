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
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const confirming = ref(false)

watch(open, async (value) => {
  await nextTick()
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

function onCancel() {
  open.value = false
  if (!confirming.value) {
    emit('cancel')
  }
  confirming.value = false
}

function onClose() {
  if (confirming.value) {
    confirming.value = false
    return
  }
  // Nested dialog teardown can close this element while v-model still says open.
  if (open.value) {
    nextTick(() => {
      if (open.value && dialog.value && !dialog.value.open) {
        dialog.value.showModal()
      }
    })
  }
}

function onConfirm() {
  confirming.value = true
  open.value = false
  emit('confirm')
}
</script>

<template>
  <!-- Keep outside parent <dialog> trees; nested showModal closes the Register modal. -->
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="w-[min(28rem,calc(100vw-2rem))] border border-rule bg-panel p-0 text-ink shadow-[0_16px_40px_var(--shadow)] backdrop:bg-ink/40"
      style="border-radius: var(--radius-panel)"
      @cancel="onCancel"
      @close="onClose"
    >
      <form class="flex flex-col gap-4 p-5" @submit.prevent="onConfirm">
        <h2 class="text-lg font-semibold tracking-tight">{{ title }}</h2>
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
    </dialog>
  </Teleport>
</template>
