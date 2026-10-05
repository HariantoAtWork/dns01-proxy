<script setup lang="ts">
const name = defineModel<string>('name', { required: true })
const satisfyAny = defineModel<boolean>('satisfyAny', { required: true })
const passAuthUpstream = defineModel<boolean>('passAuthUpstream', { required: true })

defineProps<{
  usersLength: number
}>()
</script>

<template>
  <div
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
      v-if="usersLength"
      class="text-xs text-muted"
    >
      Basic Auth users are set — enable Force SSL on bound Proxy Hosts so credentials are not sent over plain HTTP.
    </p>
  </div>
</template>
