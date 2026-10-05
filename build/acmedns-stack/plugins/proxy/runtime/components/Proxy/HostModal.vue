<script setup lang="ts">
import type { ProxyHost, ProxyHostInput } from '#proxy-shared/types/proxyHost'
import type { ProxyCertCandidate } from '#proxy-shared/utils/proxyCertMatch'
import { PROXY_SSL_AUTO, resolveCertificatesForDomains } from '#proxy-shared/utils/proxyCertMatch'
import {
  asForwardPort,
  applyForwardTargetInput,
  emptyProxyHost,
  findDuplicateDomainConflicts,
  formatDuplicateDomainWarning,
  normalizeDomainNames,
  validateDomainName,
} from '#proxy-shared/utils/proxyHost'

const {
  certEntries = [],
  existingHosts = [],
  accessLists = [],
  bearerLists = [],
  saving = false,
} = defineProps<{
  certEntries?: ProxyCertCandidate[]
  existingHosts?: Array<Pick<ProxyHost, 'id' | 'domainNames' | 'enabled' | 'certificateName'>>
  accessLists?: Array<{ id: string, name: string }>
  bearerLists?: Array<{ id: string, name: string }>
  saving?: boolean
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{
  save: [host: ProxyHostInput]
}>()

type Tab = 'details' | 'locations' | 'ssl'

const tab = ref<Tab>('details')
const draft = ref<ProxyHostInput>(emptyProxyHost())
const domainsText = ref('')
const formError = ref<string | null>(null)
const detailsPanel = ref<{ resetDetailsInfoOpen: () => void } | null>(null)

const tabs: Array<{ id: Tab, label: string }> = [
  { id: 'details', label: 'Details' },
  { id: 'locations', label: 'Locations' },
  { id: 'ssl', label: 'SSL' },
]

const modalTitle = computed(() =>
  draft.value.id ? 'Edit Proxy Host' : 'Add Proxy Host',
)

const draftDomains = computed(() => normalizeDomainNames(domainsText.value))

const duplicateConflicts = computed(() =>
  findDuplicateDomainConflicts(draftDomains.value, existingHosts, draft.value.id),
)

const duplicateWarning = computed(() => formatDuplicateDomainWarning(duplicateConflicts.value))

const {
  portPlaceholder,
  pasteForwardTarget,
  onHostForwardBlur,
  onLocationForwardBlur,
} = useForwardTargetFields(draft)

const {
  sslInfoOpen,
  resetSslInfoOpen,
  sslEnabled,
  boundAvailability,
  sslStatusParts,
  setSslEnabled,
  enableSslFeature,
} = useProxyHostSsl({
  draft,
  draftDomains,
  certEntries: () => certEntries,
  existingHosts: () => existingHosts,
  formError,
  duplicateWarning,
})

function load(host?: ProxyHost | null) {
  tab.value = 'details'
  formError.value = null
  resetSslInfoOpen()
  detailsPanel.value?.resetDetailsInfoOpen()
  if (host) {
    // Hosts from the list are Vue proxies — structuredClone throws on them.
    draft.value = structuredClone(toRaw(host))
    domainsText.value = host.domainNames.join('\n')
  }
  else {
    draft.value = emptyProxyHost()
    domainsText.value = ''
  }
}

defineExpose({ load })

function onSave() {
  formError.value = null
  applyForwardTargetInput(draft.value, draft.value.forwardHost)
  for (const location of draft.value.locations) {
    applyForwardTargetInput(location, location.forwardHost)
  }
  const scheme = draft.value.forwardScheme
  const payload: ProxyHostInput = {
    ...draft.value,
    ...(draft.value.id ? { id: draft.value.id } : {}),
    domainNames: normalizeDomainNames(domainsText.value),
    forwardPort: asForwardPort(draft.value.forwardPort, scheme),
    locations: draft.value.locations.map(location => ({
      ...location,
      forwardPort: asForwardPort(location.forwardPort, location.forwardScheme),
    })),
  }
  if (!payload.domainNames.length) {
    formError.value = 'At least one domain name is required'
    tab.value = 'details'
    return
  }
  for (const name of payload.domainNames) {
    const domainError = validateDomainName(name)
    if (domainError) {
      formError.value = domainError
      tab.value = 'details'
      return
    }
  }
  const duplicates = findDuplicateDomainConflicts(payload.domainNames, existingHosts, payload.id)
  if (duplicates.length) {
    formError.value = formatDuplicateDomainWarning(duplicates)
    tab.value = 'details'
    return
  }
  if (!payload.forwardHost.trim()) {
    formError.value = 'Forward hostname / IP is required'
    tab.value = 'details'
    return
  }
  if (payload.certificateName) {
    const binding = resolveCertificatesForDomains(payload.domainNames, certEntries)
    if (!binding) {
      formError.value = 'No live certificate fully covers these domains — turn SSL off or fix SANs under live/.'
      tab.value = 'ssl'
      return
    }
    payload.certificateName = PROXY_SSL_AUTO
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
        aria-label="Proxy host sections"
      />

      <p
        v-if="formError"
        class="text-sm text-danger"
        role="alert"
      >
        {{ formError }}
      </p>
      <p
        v-else-if="duplicateWarning"
        class="text-sm text-danger"
        role="status"
      >
        {{ duplicateWarning }}
      </p>

      <ProxyHostModalDetails
        v-show="tab === 'details'"
        ref="detailsPanel"
        v-model:domains-text="domainsText"
        :draft="draft"
        :port-placeholder="portPlaceholder"
        :duplicate-warning="duplicateWarning"
        :access-lists="accessLists"
        :bearer-lists="bearerLists"
        :paste-forward-target="pasteForwardTarget"
        :blur-host-forward="onHostForwardBlur"
      />

      <ProxyHostModalLocations
        v-show="tab === 'locations'"
        :draft="draft"
        :paste-forward-target="pasteForwardTarget"
        :blur-location-forward="onLocationForwardBlur"
      />

      <ProxyHostModalSsl
        v-show="tab === 'ssl'"
        :draft="draft"
        :draft-domains="draftDomains"
        :ssl-enabled="sslEnabled"
        :bound-availability="boundAvailability"
        :ssl-status-parts="sslStatusParts"
        :ssl-info-open="sslInfoOpen"
        :set-ssl-enabled="setSslEnabled"
        :enable-ssl-feature="enableSslFeature"
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
