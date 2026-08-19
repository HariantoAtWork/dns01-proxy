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

function onCancel() {
  open.value = false
  if (!confirming.value) {
    emit('cancel')
  }
  confirming.value = false
}

function onConfirm() {
  confirming.value = true
  open.value = false
  emit('confirm')
}
</script>

<template>
  <dialog
    ref="dialog"
    class="w-[min(28rem,calc(100vw-2rem))] border border-rule bg-panel p-0 text-ink shadow-[0_16px_40px_var(--shadow)] backdrop:bg-ink/40"
    style="border-radius: var(--radius-panel)"
    @close="onCancel"
  >
    <form class="flex flex-col gap-4 p-5" @submit.prevent="onConfirm">
      <h2 class="text-lg font-semibold tracking-tight">{{ title }}</h2>
      <div class="text-sm text-muted">
        <slot />
      </div>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="rounded-[6px] border border-rule px-3 py-2 text-sm hover:bg-paper"
          @click="onCancel"
        >
          {{ cancelLabel }}
        </button>
        <button
          type="submit"
          class="rounded-[6px] px-3 py-2 text-sm active:scale-[0.98]"
          :class="danger ? 'bg-danger text-signal-ink' : 'bg-signal text-signal-ink'"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </form>
  </dialog>
</template>
