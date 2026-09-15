<script setup lang="ts">
import type {
  BearerListInput,
  BearerListKeyInput,
  BearerListPublic,
} from '#proxy-shared/types/bearerKey'
import { emptyBearerList } from '#proxy-shared/utils/bearerKey'
import { PhPlus as Plus, PhTrash as Trash } from '@phosphor-icons/vue'

const { saving = false } = defineProps<{
  saving?: boolean
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{
  save: [list: BearerListInput]
}>()

const draftId = ref<string | undefined>()
const name = ref('')
const keys = ref<Array<BearerListKeyInput & { prefix?: string, tokenSet?: boolean }>>([])
const formError = ref<string | null>(null)

const modalTitle = computed(() =>
  draftId.value ? 'Edit Bearer List' : 'Add Bearer List',
)

function load(list?: BearerListPublic | null) {
  formError.value = null
  if (list) {
    draftId.value = list.id
    name.value = list.name
    keys.value = list.keys.map(key => ({
      id: key.id,
      token: key.token || '',
      prefix: key.prefix,
      tokenSet: key.tokenSet,
    }))
  }
  else {
    const empty = emptyBearerList()
    draftId.value = undefined
    name.value = empty.name
    keys.value = empty.keys.map(key => ({ token: key.token || '' }))
  }
}

defineExpose({ load })

function addKey() {
  keys.value = [...keys.value, { token: '' }]
}

function removeKey(index: number) {
  keys.value = keys.value.filter((_, i) => i !== index)
}

function submit() {
  formError.value = null
  const trimmedName = name.value.trim()
  if (!trimmedName) {
    formError.value = 'Name is required'
    return
  }
  if (!keys.value.length) {
    formError.value = 'Add at least one bearer key'
    return
  }
  emit('save', {
    id: draftId.value,
    name: trimmedName,
    keys: keys.value.map(key => ({
      id: key.id,
      token: key.token,
    })),
  })
}

function placeholderFor(key: { token?: string, tokenSet?: boolean }): string {
  if (key.token) {
    return ''
  }
  if (key.tokenSet) {
    return 'Leave blank to keep existing'
  }
  return 'Leave blank to auto-generate'
}
</script>

<template>
  <UiModal
    v-model:open="open"
    :title="modalTitle"
    size="lg"
  >
    <form
      class="flex flex-col gap-4"
      @submit.prevent="submit"
    >
      <UiField
        label="Name"
        hint="Shown when binding this list on a Proxy Host"
      >
        <template #default="{ id }">
          <input
            :id
            v-model="name"
            type="text"
            class="ui-input w-full border border-rule bg-paper px-3 py-2 text-sm"
            style="border-radius: var(--radius-input)"
            placeholder="e.g. AI clients"
            autocomplete="off"
          >
        </template>
      </UiField>

      <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm font-medium text-ink">
            Bearer keys
          </p>
          <UiButton
            type="button"
            variant="ghost"
            size="sm"
            @click="addKey"
          >
            <Plus :size="14" weight="bold" aria-hidden="true" />
            Add key
          </UiButton>
        </div>

        <div
          v-for="(key, index) in keys"
          :key="key.id || index"
          class="flex items-center gap-2"
        >
          <input
            v-model="key.token"
            type="text"
            class="ui-input min-w-0 flex-1 border border-rule bg-paper px-3 py-2 font-mono text-sm"
            style="border-radius: var(--radius-input)"
            :placeholder="placeholderFor(key)"
            :aria-label="`Bearer token ${index + 1}`"
            autocomplete="off"
            spellcheck="false"
          >
          <UiButton
            type="button"
            variant="icon"
            size="sm"
            aria-label="Remove key"
            :disabled="keys.length <= 1"
            @click="removeKey(index)"
          >
            <Trash :size="14" weight="regular" aria-hidden="true" />
          </UiButton>
        </div>
      </div>

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
          {{ saving ? 'Saving…' : (draftId ? 'Save' : 'Create') }}
        </UiButton>
      </div>
    </form>
  </UiModal>
</template>
