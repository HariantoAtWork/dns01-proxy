<script setup lang="ts">
import type { BearerKeyInput, BearerKeyPublic } from '#proxy-shared/types/bearerKey'
import { emptyBearerKey } from '#proxy-shared/utils/bearerKey'

const { saving = false } = defineProps<{
  saving?: boolean
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{
  save: [input: BearerKeyInput]
}>()

const draft = ref<BearerKeyInput>(emptyBearerKey())
const formError = ref<string | null>(null)

const modalTitle = computed(() =>
  draft.value.id ? 'Edit Bearer Key' : 'Add Bearer Key',
)

function load(key?: BearerKeyPublic | null) {
  formError.value = null
  if (key) {
    draft.value = { id: key.id, name: key.name }
  }
  else {
    draft.value = emptyBearerKey()
  }
}

defineExpose({ load })

function submit() {
  formError.value = null
  const name = String(draft.value.name || '').trim()
  if (!name) {
    formError.value = 'Name is required'
    return
  }
  emit('save', { ...draft.value, name })
}
</script>

<template>
  <UiModal
    v-model:open="open"
    :title="modalTitle"
  >
    <form
      class="flex flex-col gap-4"
      @submit.prevent="submit"
    >
      <p
        v-if="!draft.id"
        class="text-sm text-muted"
      >
        A new token is generated on create. Copy it once — it is not shown again.
      </p>
      <p
        v-else
        class="text-sm text-muted"
      >
        Rename only. Use Rotate on the list to issue a new token.
      </p>

      <UiField label="Name">
        <template #default="{ id }">
          <input
            :id
            v-model="draft.name"
            type="text"
            class="ui-input w-full border border-rule bg-paper px-3 py-2 text-sm"
            style="border-radius: var(--radius-input)"
            placeholder="e.g. Cursor agents"
            autocomplete="off"
          >
        </template>
      </UiField>

      <p
        v-if="formError"
        class="text-sm text-danger"
        role="alert"
      >
        {{ formError }}
      </p>

      <div class="flex justify-end gap-2 pt-2">
        <UiButton
          type="button"
          variant="ghost"
          :disabled="saving"
          @click="open = false"
        >
          Cancel
        </UiButton>
        <UiButton
          type="submit"
          :disabled="saving"
        >
          {{ saving ? 'Saving…' : (draft.id ? 'Save' : 'Create') }}
        </UiButton>
      </div>
    </form>
  </UiModal>
</template>
