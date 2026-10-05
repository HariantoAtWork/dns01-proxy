<script setup lang="ts">
import type { AccessListUserInput } from '#proxy-shared/types/accessList'
import { PhPlus as Plus, PhTrash as Trash } from '@phosphor-icons/vue'

const users = defineModel<Array<AccessListUserInput & { passwordSet?: boolean }>>('users', { required: true })

function addUser() {
  users.value = [...users.value, { username: '', password: '' }]
}

function removeUser(index: number) {
  users.value = users.value.filter((_, i) => i !== index)
}
</script>

<template>
  <div
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
</template>
