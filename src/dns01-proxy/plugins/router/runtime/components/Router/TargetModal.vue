<script setup lang="ts">
import type { RouterTarget, RouterTargetInput } from '#router-shared/types/routerTarget'
import { emptyRouterTarget } from '#router-shared/utils/routerTarget'

const { saving = false } = defineProps<{
  saving?: boolean
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{
  save: [target: RouterTargetInput]
}>()

const draftId = ref<string | undefined>()
const name = ref('')
const host = ref('')
const notes = ref('')
const enabled = ref(true)
const formError = ref<string | null>(null)

const modalTitle = computed(() =>
  draftId.value ? 'Edit Target' : 'Add Target',
)

function load(target?: RouterTarget | null) {
  formError.value = null
  if (target) {
    draftId.value = target.id
    name.value = target.name
    host.value = target.host
    notes.value = target.notes || ''
    enabled.value = target.enabled
  }
  else {
    const empty = emptyRouterTarget()
    draftId.value = undefined
    name.value = empty.name || ''
    host.value = empty.host || ''
    notes.value = ''
    enabled.value = empty.enabled !== false
  }
}

defineExpose({ load })

function onSave() {
  formError.value = null
  if (!name.value.trim()) {
    formError.value = 'Name is required'
    return
  }
  if (!host.value.trim()) {
    formError.value = 'Host is required'
    return
  }
  emit('save', {
    ...(draftId.value ? { id: draftId.value } : {}),
    name: name.value,
    host: host.value,
    notes: notes.value.trim() || null,
    enabled: enabled.value,
  })
}
</script>

<template>
  <UiModal
    v-model:open="open"
    :title="modalTitle"
  >
    <div class="flex flex-col gap-4">
      <p
        v-if="formError"
        class="text-sm text-danger"
        role="alert"
      >
        {{ formError }}
      </p>

      <UiField
        label="Name"
        hint="Short slug, e.g. sunshine"
      >
        <UiInput
          v-model="name"
          autocomplete="off"
          placeholder="sunshine"
        />
      </UiField>

      <UiField
        label="Host"
        hint="Hostname or IP on your LAN / Docker network"
      >
        <UiInput
          v-model="host"
          autocomplete="off"
          placeholder="192.168.1.50"
        />
      </UiField>

      <UiField
        label="Notes"
        hint="Optional"
      >
        <UiInput
          v-model="notes"
          autocomplete="off"
          placeholder="Gaming PC"
        />
      </UiField>

      <label class="flex items-center gap-2 text-sm text-ink">
        <input
          v-model="enabled"
          type="checkbox"
          class="size-4 accent-[var(--signal)]"
        >
        Enabled
      </label>

      <div class="flex justify-end gap-2 border-t border-rule pt-3">
        <UiButton
          variant="ghost"
          :disabled="saving"
          @click="open = false"
        >
          Cancel
        </UiButton>
        <UiButton
          :disabled="saving"
          @click="onSave"
        >
          Save
        </UiButton>
      </div>
    </div>
  </UiModal>
</template>
