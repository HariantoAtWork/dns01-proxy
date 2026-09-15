<script setup lang="ts">
import type { ForwardScheme, ProxyHost, ProxyHostInput, ProxyLocation } from '#proxy-shared/types/proxyHost'
import type { ProxyCertCandidate } from '#proxy-shared/utils/proxyCertMatch'
import {
  PROXY_SSL_AUTO,
  poolSslCoverage,
  proxyHostSslAvailability,
  proxySslAvailabilityClass,
  proxySslAvailabilityLabel,
  proxySslCertLabel,
  resolveCertificatesForDomains,
} from '#proxy-shared/utils/proxyCertMatch'
import {
  asForwardPort,
  applyForwardTargetInput,
  defaultForwardPort,
  emptyProxyHost,
  findDuplicateDomainConflicts,
  formatDuplicateDomainWarning,
  normalizeDomainNames,
  parseForwardTargetInput,
  validateDomainName,
} from '#proxy-shared/utils/proxyHost'
import { PhPlus as Plus, PhTrash as Trash } from '@phosphor-icons/vue'

const {
  certEntries = [],
  existingHosts = [],
  accessLists = [],
  bearerLists = [],
  saving = false,
} = defineProps<{
  certEntries?: ProxyCertCandidate[]
  existingHosts?: Array<Pick<ProxyHost, 'id' | 'domainNames'>>
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
const sslInfoOpen = reactive({
  cert: false,
  force: false,
  http2: false,
  hsts: false,
  hstsSubdomains: false,
  trustForwardedProto: false,
})

const detailsInfoOpen = reactive({
  domains: false,
  enabled: false,
  websockets: false,
})

function resetSslInfoOpen() {
  sslInfoOpen.cert = false
  sslInfoOpen.force = false
  sslInfoOpen.http2 = false
  sslInfoOpen.hsts = false
  sslInfoOpen.hstsSubdomains = false
  sslInfoOpen.trustForwardedProto = false
}

function resetDetailsInfoOpen() {
  detailsInfoOpen.domains = false
  detailsInfoOpen.enabled = false
  detailsInfoOpen.websockets = false
}

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

const sslBinding = computed(() => resolveCertificatesForDomains(draftDomains.value, certEntries))

const sslEnabled = computed(() => Boolean(draft.value.certificateName))

const boundAvailability = computed(() =>
  proxyHostSslAvailability(draft.value.certificateName, draftDomains.value, certEntries),
)

const sslStatusLine = computed(() => {
  if (!draftDomains.value.length) {
    return 'Add domain names on Details first.'
  }
  if (!sslEnabled.value) {
    if (sslBinding.value) {
      return `Off — live certs ready: ${sslBinding.value.certNames.join(', ')}`
    }
    const pool = poolSslCoverage(draftDomains.value, certEntries)
    if (pool.availability === 'some') {
      return `Off — only ${pool.covered}/${pool.total} domains have a live cert.`
    }
    return 'Off — no live certificate covers these domains yet (Certificates page).'
  }
  const label = proxySslAvailabilityLabel(boundAvailability.value)
  const certs = proxySslCertLabel(draft.value.certificateName, draftDomains.value, certEntries)
  return `${label} · ${certs}`
})

const portPlaceholder = computed(() => String(defaultForwardPort(draft.value.forwardScheme)))

function emptyLocation(): ProxyLocation {
  return {
    path: '/',
    forwardScheme: 'http',
    forwardHost: '',
    forwardPort: 80,
  }
}

function load(host?: ProxyHost | null) {
  tab.value = 'details'
  formError.value = null
  resetSslInfoOpen()
  resetDetailsInfoOpen()
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

function addLocation() {
  draft.value.locations = [...draft.value.locations, emptyLocation()]
}

function removeLocation(index: number) {
  draft.value.locations = draft.value.locations.filter((_, i) => i !== index)
}

/** Enable SSL when every domain is covered by some live cert (may be several certs). */
function applyLiveCertificates(): boolean {
  const binding = resolveCertificatesForDomains(draftDomains.value, certEntries)
  if (!binding) {
    return false
  }
  draft.value.certificateName = PROXY_SSL_AUTO
  return true
}

function clearSsl() {
  draft.value.certificateName = null
  draft.value.sslForced = false
  draft.value.http2Support = false
  draft.value.hstsEnabled = false
  draft.value.hstsSubdomains = false
}

function setSslEnabled(enabled: boolean) {
  if (!enabled) {
    clearSsl()
    formError.value = null
    return
  }
  const ok = applyLiveCertificates()
  if (!ok) {
    formError.value = 'No live certificate covers every domain — issue SANs under live/ first.'
    return
  }
  formError.value = null
}

/** When turning SSL options on, ensure live coverage for every domain. */
function enableSslFeature(feature: 'sslForced' | 'http2Support' | 'hstsEnabled', enabled: boolean) {
  if (!enabled) {
    draft.value[feature] = false
    if (feature === 'sslForced') {
      draft.value.hstsEnabled = false
      draft.value.hstsSubdomains = false
    }
    if (feature === 'hstsEnabled') {
      draft.value.hstsSubdomains = false
    }
    return
  }

  if (!draft.value.certificateName) {
    const ok = applyLiveCertificates()
    if (!ok) {
      formError.value = 'No live certificate covers every domain — issue SANs under live/ first.'
      return
    }
    formError.value = null
  }

  draft.value[feature] = true
  if (feature === 'hstsEnabled' && !draft.value.sslForced) {
    draft.value.sslForced = true
  }
}

/** Keep SSL only while the live pool fully covers every domain. */
watch(draftDomains, () => {
  if (formError.value && /already used by another proxy host/i.test(formError.value)) {
    formError.value = duplicateWarning.value || null
  }
  if (!draft.value.certificateName) {
    return
  }
  if (!resolveCertificatesForDomains(draftDomains.value, certEntries)) {
    clearSsl()
    return
  }
  draft.value.certificateName = PROXY_SSL_AUTO
})

watch(
  () => draft.value.forwardScheme,
  (scheme, previous) => {
    if (!previous) {
      return
    }
    const port = Number(draft.value.forwardPort)
    if (!port || port === defaultForwardPort(previous as ForwardScheme)) {
      draft.value.forwardPort = defaultForwardPort(scheme)
    }
  },
)

function pasteForwardTarget(
  target: { forwardScheme: ForwardScheme, forwardHost: string, forwardPort: number },
  event: ClipboardEvent,
) {
  const text = event.clipboardData?.getData('text') ?? ''
  if (!parseForwardTargetInput(text)) {
    return
  }
  event.preventDefault()
  applyForwardTargetInput(target, text)
}

function onHostForwardBlur() {
  applyForwardTargetInput(draft.value, draft.value.forwardHost)
}

function onLocationForwardBlur(location: ProxyLocation) {
  applyForwardTargetInput(location, location.forwardHost)
}

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
      <div
        class="sticky top-0 z-[1] -mx-1 flex flex-wrap gap-1 border-b border-rule bg-panel pb-2"
        role="tablist"
        aria-label="Proxy host sections"
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
      <p
        v-else-if="duplicateWarning"
        class="text-sm text-danger"
        role="status"
      >
        {{ duplicateWarning }}
      </p>

      <div
        v-show="tab === 'details'"
        class="flex min-h-[14rem] flex-col gap-4"
        role="tabpanel"
      >
        <UiField
          v-model:info-open="detailsInfoOpen.domains"
          label="Domain Names"
          info="One per line or comma-separated. Wildcards like *.example.com match one label. Each domain can only belong to one proxy host."
        >
          <template #default="{ id }">
            <textarea
              :id
              v-model="domainsText"
              rows="3"
              class="ui-input w-full border border-rule bg-paper px-3 py-2 font-mono text-sm"
              style="border-radius: var(--radius-input)"
              :aria-invalid="Boolean(duplicateWarning)"
            />
          </template>
        </UiField>

        <div class="grid gap-3 sm:grid-cols-3">
          <UiField label="Scheme">
            <template #default="{ id }">
              <select
                :id
                v-model="draft.forwardScheme"
                class="ui-input w-full border border-rule bg-paper px-3 py-2 text-sm"
                style="border-radius: var(--radius-input)"
              >
                <option value="http">
                  http
                </option>
                <option value="https">
                  https
                </option>
              </select>
            </template>
          </UiField>
          <UiField label="Forward Hostname / IP">
            <template #default="{ id }">
              <UiInput
                :id
                v-model="draft.forwardHost"
                mono
                @paste="pasteForwardTarget(draft, $event)"
                @blur="onHostForwardBlur"
              />
            </template>
          </UiField>
          <UiField label="Forward Port" :hint="`empty → ${portPlaceholder}`">
            <template #default="{ id }">
              <input
                :id
                v-model.number="draft.forwardPort"
                type="number"
                min="1"
                max="65535"
                :placeholder="portPlaceholder"
                class="ui-input w-full border border-rule bg-paper px-3 py-2 font-mono text-sm"
                style="border-radius: var(--radius-input)"
                @paste="pasteForwardTarget(draft, $event)"
              >
            </template>
          </UiField>
        </div>

        <div class="flex flex-col gap-2 rounded-[var(--radius-panel)] border border-rule p-3">
          <UiInfoDrawer
            v-model="detailsInfoOpen.enabled"
            label="About Enabled"
          >
            <template #title>
              <span>Enabled</span>
            </template>
            <template #action>
              <input
                v-model="draft.enabled"
                type="checkbox"
                class="size-4"
                aria-label="Enabled"
              >
            </template>
            <template #info>
              When off, the edge proxy ignores this host — no routing until you turn it back on.
            </template>
          </UiInfoDrawer>
          <UiInfoDrawer
            v-model="detailsInfoOpen.websockets"
            label="About Websockets Support"
          >
            <template #title>
              <span>Websockets Support</span>
            </template>
            <template #action>
              <input
                v-model="draft.allowWebsocketUpgrade"
                type="checkbox"
                class="size-4"
                aria-label="Websockets Support"
              >
            </template>
            <template #info>
              Allow WebSocket upgrades through to the upstream (Upgrade / Connection headers). Leave off for plain HTTP only.
            </template>
          </UiInfoDrawer>
        </div>

        <UiField
          label="Access List"
          hint="Gate by IP / Basic Auth — manage lists under Access Lists"
        >
          <template #default="{ id }">
            <select
              :id
              class="ui-input w-full border border-rule bg-paper px-3 py-2 text-sm"
              style="border-radius: var(--radius-input)"
              :value="draft.accessListId || ''"
              @change="draft.accessListId = ($event.target as HTMLSelectElement).value || null"
            >
              <option value="">
                Publicly Accessible
              </option>
              <option
                v-for="list in accessLists"
                :key="list.id"
                :value="list.id"
              >
                {{ list.name }}
              </option>
            </select>
          </template>
        </UiField>

        <UiField
          label="Bearer List"
          hint="Require Authorization: Bearer matching any key in the list — manage under Bearer Lists. Unauthenticated GET / shows upstream live status."
        >
          <template #default="{ id }">
            <select
              :id
              class="ui-input w-full border border-rule bg-paper px-3 py-2 text-sm"
              style="border-radius: var(--radius-input)"
              :value="draft.bearerListId || ''"
              @change="draft.bearerListId = ($event.target as HTMLSelectElement).value || null"
            >
              <option value="">
                None
              </option>
              <option
                v-for="list in bearerLists"
                :key="list.id"
                :value="list.id"
              >
                {{ list.name }}
              </option>
            </select>
          </template>
        </UiField>
      </div>

      <div
        v-show="tab === 'locations'"
        class="flex min-h-[14rem] flex-col gap-3"
        role="tabpanel"
      >
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm text-muted">
            Path-specific forward targets
          </p>
          <UiButton
            variant="ghost"
            size="sm"
            @click="addLocation"
          >
            <Plus :size="14" weight="bold" aria-hidden="true" />
            Add Location
          </UiButton>
        </div>

        <p
          v-if="!draft.locations.length"
          class="text-sm text-muted"
        >
          No custom locations yet.
        </p>

        <div
          v-for="(location, index) in draft.locations"
          :key="index"
          class="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-rule p-3"
        >
          <div class="flex items-start justify-between gap-2">
            <p class="text-sm font-medium">
              Location {{ index + 1 }}
            </p>
            <UiButton
              variant="icon"
              size="sm"
              aria-label="Remove location"
              @click="removeLocation(index)"
            >
              <Trash :size="14" weight="regular" aria-hidden="true" />
            </UiButton>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <UiField label="Path">
              <UiInput
                v-model="location.path"
                mono
              />
            </UiField>
            <UiField label="Scheme">
              <select
                v-model="location.forwardScheme"
                class="ui-input w-full border border-rule bg-paper px-3 py-2 text-sm"
                style="border-radius: var(--radius-input)"
              >
                <option value="http">
                  http
                </option>
                <option value="https">
                  https
                </option>
              </select>
            </UiField>
            <UiField label="Forward Host">
              <UiInput
                v-model="location.forwardHost"
                mono
                @paste="pasteForwardTarget(location, $event)"
                @blur="onLocationForwardBlur(location)"
              />
            </UiField>
            <UiField label="Port" :hint="`empty → ${defaultForwardPort(location.forwardScheme)}`">
              <input
                v-model.number="location.forwardPort"
                type="number"
                min="1"
                max="65535"
                :placeholder="String(defaultForwardPort(location.forwardScheme))"
                class="ui-input w-full border border-rule bg-paper px-3 py-2 font-mono text-sm"
                style="border-radius: var(--radius-input)"
                @paste="pasteForwardTarget(location, $event)"
              >
            </UiField>
          </div>
        </div>
      </div>

      <div
        v-show="tab === 'ssl'"
        class="flex min-h-[14rem] flex-col gap-4"
        role="tabpanel"
      >
        <div class="flex flex-col gap-2 rounded-[var(--radius-panel)] border border-rule p-3">
          <UiInfoDrawer
            v-model="sslInfoOpen.cert"
            label="About SSL certificates"
          >
            <template #title>
              <span>SSL Certificate</span>
            </template>
            <template #action>
              <input
                type="checkbox"
                class="size-4"
                :checked="sslEnabled"
                :disabled="!draftDomains.length && !sslEnabled"
                aria-label="SSL Certificate"
                @change="setSslEnabled(($event.target as HTMLInputElement).checked)"
              >
            </template>
            <p
              class="text-xs"
              :class="sslEnabled ? proxySslAvailabilityClass(boundAvailability) : 'text-muted'"
            >
              {{ sslStatusLine }}
            </p>
            <template #info>
              Uses live/ certificates per domain (e.g. *.mizu.work and *.harianto.dev together) — no manual pick.
            </template>
          </UiInfoDrawer>
        </div>

        <div class="flex flex-col gap-2 rounded-[var(--radius-panel)] border border-rule p-3">
          <UiInfoDrawer
            v-model="sslInfoOpen.force"
            label="About Force SSL"
          >
            <template #title>
              <span>Force SSL</span>
            </template>
            <template #action>
              <input
                type="checkbox"
                class="size-4"
                :checked="draft.sslForced"
                aria-label="Force SSL"
                @change="enableSslFeature('sslForced', ($event.target as HTMLInputElement).checked)"
              >
            </template>
            <template #info>
              Redirect HTTP to HTTPS for this host when SSL is enabled. Skips the redirect when the request already looks like HTTPS (e.g. X-Forwarded-Proto).
            </template>
          </UiInfoDrawer>
          <UiInfoDrawer
            v-model="sslInfoOpen.http2"
            label="About HTTP/2 support"
          >
            <template #title>
              <span>HTTP/2 Support</span>
            </template>
            <template #action>
              <input
                type="checkbox"
                class="size-4"
                :checked="draft.http2Support"
                aria-label="HTTP/2 Support"
                @change="enableSslFeature('http2Support', ($event.target as HTMLInputElement).checked)"
              >
            </template>
            <template #info>
              Also serve HTTP/2 beside HTTP/1.1 on the edge HTTPS listener (ALPN). Not a replacement for h1.
            </template>
          </UiInfoDrawer>
          <UiInfoDrawer
            v-model="sslInfoOpen.hsts"
            label="About HSTS"
          >
            <template #title>
              <span>HSTS Enable</span>
            </template>
            <template #action>
              <input
                type="checkbox"
                class="size-4"
                :checked="draft.hstsEnabled"
                aria-label="HSTS Enable"
                @change="enableSslFeature('hstsEnabled', ($event.target as HTMLInputElement).checked)"
              >
            </template>
            <template #info>
              Send Strict-Transport-Security (max-age one year) on HTTPS responses. Turning this on also enables Force SSL.
            </template>
          </UiInfoDrawer>
          <UiInfoDrawer
            v-model="sslInfoOpen.hstsSubdomains"
            label="About HSTS Subdomains"
          >
            <template #title>
              <span>HSTS Subdomains</span>
            </template>
            <template #action>
              <input
                v-model="draft.hstsSubdomains"
                type="checkbox"
                class="size-4"
                aria-label="HSTS Subdomains"
                :disabled="!draft.hstsEnabled"
              >
            </template>
            <template #info>
              Add includeSubDomains to the HSTS header so browsers apply it to every subdomain of this host.
            </template>
          </UiInfoDrawer>
          <UiInfoDrawer
            v-model="sslInfoOpen.trustForwardedProto"
            label="About Trust Forwarded Proto"
          >
            <template #title>
              <span>Trust Forwarded Proto</span>
            </template>
            <template #action>
              <input
                v-model="draft.trustForwardedProto"
                type="checkbox"
                class="size-4"
                aria-label="Trust Forwarded Proto"
              >
            </template>
            <template #info>
              Honour inbound X-Forwarded-Proto (Cloudflare Flexible, Synology TLS termination, and similar) when deciding the client scheme and avoiding redirect loops.
            </template>
          </UiInfoDrawer>
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
