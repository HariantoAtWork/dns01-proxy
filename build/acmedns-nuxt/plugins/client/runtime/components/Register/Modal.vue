<script setup lang="ts">
import { domainsPath } from '#shared/utils/domainsRoute'

const { open, hide } = useRegisterModal()
const router = useRouter()
const dialogId = useId()

function onDone(domain?: string) {
  hide()
  if (domain) {
    void router.push(domainsPath(domain))
  }
}
</script>

<template>
  <UiModal :id="dialogId" v-model:open="open" title="Register domain" size="lg">
    <RegisterFlow v-if="open" embedded @done="onDone" />
  </UiModal>
</template>
