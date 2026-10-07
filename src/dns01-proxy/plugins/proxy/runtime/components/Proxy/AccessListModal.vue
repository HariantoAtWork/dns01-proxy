<script setup lang="ts">
import type {
  AccessListInput,
  AccessListPublic,
  AccessListRule,
  AccessListUserInput,
  AccessRuleDirective,
} from '#proxy-shared/types/accessList'
import {
  emptyAccessList,
  normalizeAccessAddress,
  validateAccessAddress,
} from '#proxy-shared/utils/accessList'

const {
  saving = false,
  fetchClientIp,
} = defineProps<{
  saving?: boolean
  fetchClientIp: () => Promise<{ address: string | null, via: string | null }>
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{
  save: [list: AccessListInput]
}>()

type Tab = 'details' | 'auth' | 'access'

const tab = ref<Tab>('details')
const draftId = ref<string | undefined>()
const name = ref('')
const satisfyAny = ref(false)
const passAuthUpstream = ref(false)
const users = ref<Array<AccessListUserInput & { passwordSet?: boolean }>>([])
const rules = ref<AccessListRule[]>([])
const formError = ref<string | null>(null)
const accessTab = ref<{ resetAccessUi: () => void } | null>(null)

const tabs: Array<{ id: Tab, label: string }> = [
  { id: 'details', label: 'Details' },
  { id: 'auth', label: 'Authorization' },
  { id: 'access', label: 'Access' },
]

const modalTitle = computed(() =>
  draftId.value ? 'Edit Access List' : 'Add Access List',
)

function addRule(directive: AccessRuleDirective, address: string) {
  const normalized = normalizeAccessAddress(address)
  if (!normalized) {
    formError.value = validateAccessAddress(address) || 'Invalid IP or CIDR'
    tab.value = 'access'
    return
  }
  if (rules.value.some(rule => rule.address === normalized && rule.directive === directive)) {
    return
  }
  formError.value = null
  rules.value = [...rules.value, { directive, address: normalized }]
}

function load(list?: AccessListPublic | null, options?: { allowIp?: string }) {
  tab.value = 'details'
  formError.value = null
  accessTab.value?.resetAccessUi()
  if (list) {
    draftId.value = list.id
    name.value = list.name
    satisfyAny.value = list.satisfyAny
    passAuthUpstream.value = list.passAuthUpstream
    users.value = list.users.map(user => ({
      username: user.username,
      password: '',
      passwordSet: user.passwordSet,
    }))
    rules.value = list.rules.map(rule => ({ ...rule }))
  }
  else {
    const empty = emptyAccessList()
    draftId.value = undefined
    name.value = empty.name
    satisfyAny.value = empty.satisfyAny
    passAuthUpstream.value = empty.passAuthUpstream
    users.value = []
    rules.value = []
  }
  if (options?.allowIp) {
    tab.value = 'access'
    addRule('allow', options.allowIp)
  }
}

defineExpose({ load })

function onSave() {
  formError.value = null
  if (!name.value.trim()) {
    formError.value = 'Access list name is required'
    tab.value = 'details'
    return
  }
  for (const user of users.value) {
    if (!user.username.trim()) {
      formError.value = 'Username is required'
      tab.value = 'auth'
      return
    }
    if (!user.password && !user.passwordSet) {
      formError.value = `Password required for user ${user.username}`
      tab.value = 'auth'
      return
    }
  }
  for (const rule of rules.value) {
    const err = validateAccessAddress(rule.address)
    if (err) {
      formError.value = err
      tab.value = 'access'
      return
    }
  }

  const payload: AccessListInput = {
    ...(draftId.value ? { id: draftId.value } : {}),
    name: name.value.trim(),
    satisfyAny: satisfyAny.value,
    passAuthUpstream: passAuthUpstream.value,
    users: users.value.map(user => ({
      username: user.username.trim(),
      password: user.password || '',
    })),
    rules: rules.value.map(rule => ({ ...rule })),
  }
  emit('save', payload)
}

watch(open, (value) => {
  if (!value) {
    formError.value = null
  }
})
</script>

<template>
  <UiModal v-model:open="open" :title="modalTitle" size="lg">
    <div class="flex min-h-[20rem] flex-col gap-4">
      <ProxyModalTabs
        v-model="tab"
        :tabs="tabs"
        aria-label="Access list sections"
      />

      <p
        v-if="formError"
        class="text-sm text-danger"
        role="alert"
      >
        {{ formError }}
      </p>

      <ProxyAccessListDetailsTab
        v-show="tab === 'details'"
        v-model:name="name"
        v-model:satisfy-any="satisfyAny"
        v-model:pass-auth-upstream="passAuthUpstream"
        :users-length="users.length"
      />

      <ProxyAccessListAuthTab
        v-show="tab === 'auth'"
        v-model:users="users"
      />

      <ProxyAccessListAccessTab
        v-show="tab === 'access'"
        ref="accessTab"
        v-model:rules="rules"
        v-model:form-error="formError"
        :fetch-client-ip="fetchClientIp"
        :add-rule="addRule"
        :focus-access-tab="() => { tab = 'access' }"
      />

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
