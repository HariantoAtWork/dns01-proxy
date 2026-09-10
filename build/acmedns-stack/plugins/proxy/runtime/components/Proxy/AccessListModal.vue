<script setup lang="ts">
import type {
  AccessListInput,
  AccessListPublic,
  AccessListRule,
  AccessListUserInput,
  AccessRuleDirective,
} from '#proxy-shared/types/accessList'
import {
  ACCESS_LIST_PRESETS,
  emptyAccessList,
  normalizeAccessAddress,
  validateAccessAddress,
} from '#proxy-shared/utils/accessList'
import { PhPlus as Plus, PhTrash as Trash } from '@phosphor-icons/vue'

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
const pasteAddress = ref('')
const clientIpHint = ref<string | null>(null)

const tabs: Array<{ id: Tab, label: string }> = [
  { id: 'details', label: 'Details' },
  { id: 'auth', label: 'Authorization' },
  { id: 'access', label: 'Access' },
]

const modalTitle = computed(() =>
  draftId.value ? 'Edit Access List' : 'Add Access List',
)

function load(list?: AccessListPublic | null, options?: { allowIp?: string }) {
  tab.value = 'details'
  formError.value = null
  pasteAddress.value = ''
  clientIpHint.value = null
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

function addUser() {
  users.value = [...users.value, { username: '', password: '' }]
}

function removeUser(index: number) {
  users.value = users.value.filter((_, i) => i !== index)
}

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

function removeRule(index: number) {
  rules.value = rules.value.filter((_, i) => i !== index)
}

function applyPreset(addresses: string[]) {
  for (const address of addresses) {
    addRule('allow', address)
  }
}

async function useMyIp() {
  formError.value = null
  try {
    const data = await fetchClientIp()
    if (!data.address) {
      formError.value = 'Could not detect your IP from this request'
      tab.value = 'access'
      return
    }
    clientIpHint.value = data.via ? `${data.address} via ${data.via}` : data.address
    addRule('allow', data.address)
  }
  catch (err) {
    formError.value = err instanceof Error ? err.message : 'Failed to detect IP'
    tab.value = 'access'
  }
}

function onPasteAddress() {
  const raw = pasteAddress.value.trim()
  if (!raw) {
    return
  }
  addRule('allow', raw)
  pasteAddress.value = ''
}

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
      <div
        class="sticky top-0 z-[1] -mx-1 flex flex-wrap gap-1 border-b border-rule bg-panel pb-2"
        role="tablist"
        aria-label="Access list sections"
      >
        <button
          v-for="item in tabs"
          :key="item.id"
          type="button"
          role="tab"
          class="rounded-[6px] px-3 py-1.5 text-sm"
          :class="tab === item.id
            ? 'bg-signal text-signal-ink'
            : 'text-muted hover:bg-panel hover:text-ink'"
          :aria-selected="tab === item.id"
          @click.stop="tab = item.id"
        >
          {{ item.label }}
        </button>
      </div>

      <p
        v-if="formError"
        class="text-sm text-danger"
        role="alert"
      >
        {{ formError }}
      </p>

      <div
        v-show="tab === 'details'"
        class="flex min-h-[14rem] flex-col gap-4"
        role="tabpanel"
      >
        <UiField label="Name">
          <template #default="{ id }">
            <UiInput
              :id
              v-model="name"
            />
          </template>
        </UiField>
        <div class="flex flex-col gap-2 rounded-[var(--radius-panel)] border border-rule p-3">
          <label class="flex items-center justify-between gap-3 text-sm">
            <span>Satisfy Any</span>
            <input
              v-model="satisfyAny"
              type="checkbox"
              class="size-4"
            >
          </label>
          <p class="text-xs text-muted">
            On: pass if IP <em>or</em> Basic Auth matches. Off: both required when both are set.
          </p>
          <label class="flex items-center justify-between gap-3 text-sm">
            <span>Pass Auth Upstream</span>
            <input
              v-model="passAuthUpstream"
              type="checkbox"
              class="size-4"
            >
          </label>
          <p class="text-xs text-muted">
            Forward the Authorization header to the upstream app.
          </p>
        </div>
        <p
          v-if="users.length"
          class="text-xs text-muted"
        >
          Basic Auth users are set — enable Force SSL on bound Proxy Hosts so credentials are not sent over plain HTTP.
        </p>
      </div>

      <div
        v-show="tab === 'auth'"
        class="flex min-h-[14rem] flex-col gap-3"
        role="tabpanel"
      >
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm text-muted">
            HTTP Basic Auth users
          </p>
          <UiButton
            variant="ghost"
            size="sm"
            @click="addUser"
          >
            <Plus :size="14" weight="bold" aria-hidden="true" />
            Add User
          </UiButton>
        </div>
        <p
          v-if="!users.length"
          class="text-sm text-muted"
        >
          No users — IP rules alone can gate access.
        </p>
        <div
          v-for="(user, index) in users"
          :key="index"
          class="grid gap-3 rounded-[var(--radius-panel)] border border-rule p-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <UiField label="Username">
            <UiInput v-model="user.username" mono />
          </UiField>
          <UiField :label="user.passwordSet ? 'Password (leave blank to keep)' : 'Password'">
            <UiInput
              v-model="user.password"
              type="password"
            />
          </UiField>
          <div class="flex items-end">
            <UiButton
              variant="icon"
              size="sm"
              aria-label="Remove user"
              @click="removeUser(index)"
            >
              <Trash :size="14" weight="regular" aria-hidden="true" />
            </UiButton>
          </div>
        </div>
      </div>

      <div
        v-show="tab === 'access'"
        class="flex min-h-[14rem] flex-col gap-3"
        role="tabpanel"
      >
        <p class="text-sm text-muted">
          Allow these → everyone else denied (implicit deny all when any rule exists).
        </p>
        <div class="flex flex-wrap gap-2">
          <UiButton
            variant="ghost"
            size="sm"
            @click="useMyIp"
          >
            Use my IP
          </UiButton>
          <UiButton
            v-for="preset in ACCESS_LIST_PRESETS"
            :key="preset.label"
            variant="ghost"
            size="sm"
            @click="applyPreset(preset.addresses)"
          >
            {{ preset.label }}
          </UiButton>
        </div>
        <p
          v-if="clientIpHint"
          class="text-xs text-muted"
        >
          Detected {{ clientIpHint }}
        </p>
        <div class="flex flex-wrap items-end gap-2">
          <UiField
            class="min-w-[12rem] flex-1"
            label="Paste IP / CIDR"
          >
            <UiInput
              v-model="pasteAddress"
              mono
              @keydown.enter.prevent="onPasteAddress"
            />
          </UiField>
          <UiButton
            size="sm"
            @click="onPasteAddress"
          >
            Allow
          </UiButton>
        </div>
        <p
          v-if="!rules.length"
          class="text-sm text-muted"
        >
          No rules yet — without rules, only Basic Auth (if any) applies.
        </p>
        <div
          v-for="(rule, index) in rules"
          :key="`${rule.directive}-${rule.address}-${index}`"
          class="flex items-center justify-between gap-2 rounded-[var(--radius-panel)] border border-rule px-3 py-2"
        >
          <div class="flex items-center gap-2 text-sm">
            <select
              v-model="rule.directive"
              class="ui-input border border-rule bg-paper px-2 py-1 text-sm"
              style="border-radius: var(--radius-input)"
            >
              <option value="allow">
                Allow
              </option>
              <option value="deny">
                Deny
              </option>
            </select>
            <span class="font-mono text-xs">{{ rule.address }}</span>
          </div>
          <UiButton
            variant="icon"
            size="sm"
            aria-label="Remove rule"
            @click="removeRule(index)"
          >
            <Trash :size="14" weight="regular" aria-hidden="true" />
          </UiButton>
        </div>
      </div>

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
