<script setup lang="ts">
const { open, hide } = useRegisterModal()
const router = useRouter()
const dialogId = useId()

function onDone(domain?: string) {
  hide()
  if (domain) {
    void router.push({ path: '/', query: { d: domain } })
  }
}
</script>

<template>
  <UiModal :id="dialogId" v-model:open="open" title="Register domain" size="lg">
    <RegisterFlow v-if="open" embedded @done="onDone" />
  </UiModal>
</template>
