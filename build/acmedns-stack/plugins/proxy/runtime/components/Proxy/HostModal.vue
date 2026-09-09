<script setup lang="ts">
import type { ProxyHost, ProxyHostInput, ProxyLocation } from '#proxy-shared/types/proxyHost'
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
import { emptyProxyHost, normalizeDomainNames, validateDomainName } from '#proxy-shared/utils/proxyHost'
import { PhPlus as Plus, PhTrash as Trash } from '@phosphor-icons/vue'

const { certEntries = [], saving = false } = defineProps<{
  certEntries?: ProxyCertCandidate[]
  saving?: boolean
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{
  save: [host: ProxyHostInput]
}>()

type Tab = 'details' | 'locations' | 'ssl' | 'advanced'

const tab = ref<Tab>('details')
const draft = ref<ProxyHostInput>(emptyProxyHost())
const domainsText = ref('')
const formError = ref<string | null>(null)

const tabs: Array<{ id: Tab, label: string }> = [
  { id: 'details', label: 'Details' },
  { id: 'locations', label: 'Locations' },
  { id: 'ssl', label: 'SSL' },
  { id: 'advanced', label: 'Advanced' },
]

const modalTitle = computed(() =>
  draft.value.id ? 'Edit Proxy Host' : 'Add Proxy Host',
)

const draftDomains = computed(() => normalizeDomainNames(domainsText.value))

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

function emptyLocation(): ProxyLocation {
  return {
    path: '/',
    forwardScheme: 'http',
    forwardHost: '',
    forwardPort: 80,
    advancedConfig: '',
  }
}

function load(host?: ProxyHost | null) {
  tab.value = 'details'
  formError.value = null
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
  if (!draft.value.certificateName) {
    return
  }
  if (!resolveCertificatesForDomains(draftDomains.value, certEntries)) {
    clearSsl()
    return
  }
  draft.value.certificateName = PROXY_SSL_AUTO
})

function onSave() {
  formError.value = null
  const payload: ProxyHostInput = {
    ...draft.value,
    ...(draft.value.id ? { id: draft.value.id } : {}),
    domainNames: normalizeDomainNames(domainsText.value),
    forwardPort: Number(draft.value.forwardPort) || 80,
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

      <div
        v-show="tab === 'details'"
        class="flex min-h-[14rem] flex-col gap-4"
        role="tabpanel"
      >
        <UiField label="Domain Names" hint="one per line; wildcards like *.example.com match one label">
          <template #default="{ id }">
            <textarea
              :id
              v-model="domainsText"
              rows="3"
              class="ui-input w-full border border-rule bg-paper px-3 py-2 font-mono text-sm"
              style="border-radius: var(--radius-input)"
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
              />
            </template>
          </UiField>
          <UiField label="Forward Port">
            <template #default="{ id }">
              <input
                :id
                v-model.number="draft.forwardPort"
                type="number"
                min="1"
                max="65535"
                class="ui-input w-full border border-rule bg-paper px-3 py-2 font-mono text-sm"
                style="border-radius: var(--radius-input)"
              >
            </template>
          </UiField>
        </div>

        <div class="flex flex-col gap-2 rounded-[var(--radius-panel)] border border-rule p-3">
          <label class="flex items-center justify-between gap-3 text-sm">
            <span>Enabled</span>
            <input
              v-model="draft.enabled"
              type="checkbox"
              class="size-4"
            >
          </label>
          <label class="flex items-center justify-between gap-3 text-sm">
            <span>Cache Assets</span>
            <input
              v-model="draft.cachingEnabled"
              type="checkbox"
              class="size-4"
            >
          </label>
          <label class="flex items-center justify-between gap-3 text-sm">
            <span>Block Common Exploits</span>
            <input
              v-model="draft.blockExploits"
              type="checkbox"
              class="size-4"
            >
          </label>
          <label class="flex items-center justify-between gap-3 text-sm">
            <span>Websockets Support</span>
            <input
              v-model="draft.allowWebsocketUpgrade"
              type="checkbox"
              class="size-4"
            >
          </label>
        </div>

        <UiField label="Access List" hint="placeholder — lists later">
          <template #default="{ id }">
            <UiInput
              :id
              model-value="Publicly Accessible"
              disabled
            />
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
              />
            </UiField>
            <UiField label="Port">
              <input
                v-model.number="location.forwardPort"
                type="number"
                min="1"
                max="65535"
                class="ui-input w-full border border-rule bg-paper px-3 py-2 font-mono text-sm"
                style="border-radius: var(--radius-input)"
              >
            </UiField>
          </div>
          <UiField label="Advanced (optional)">
            <textarea
              v-model="location.advancedConfig"
              rows="3"
              class="ui-input w-full border border-rule bg-paper px-3 py-2 font-mono text-xs"
              style="border-radius: var(--radius-input)"
            />
          </UiField>
        </div>
      </div>

      <div
        v-show="tab === 'ssl'"
        class="flex min-h-[14rem] flex-col gap-4"
        role="tabpanel"
      >
        <div class="flex flex-col gap-2 rounded-[var(--radius-panel)] border border-rule p-3">
          <label class="flex items-center justify-between gap-3 text-sm">
            <span>SSL Certificate</span>
            <input
              type="checkbox"
              class="size-4"
              :checked="sslEnabled"
              :disabled="!draftDomains.length && !sslEnabled"
              @change="setSslEnabled(($event.target as HTMLInputElement).checked)"
            >
          </label>
          <p
            class="text-xs"
            :class="sslEnabled ? proxySslAvailabilityClass(boundAvailability) : 'text-muted'"
          >
            {{ sslStatusLine }}
          </p>
          <p class="text-xs text-muted">
            Uses live/ certificates per domain (e.g. *.mizu.work and *.harianto.dev together) — no manual pick.
          </p>
        </div>

        <div class="flex flex-col gap-2 rounded-[var(--radius-panel)] border border-rule p-3">
          <label class="flex items-center justify-between gap-3 text-sm">
            <span>Force SSL</span>
            <input
              type="checkbox"
              class="size-4"
              :checked="draft.sslForced"
              @change="enableSslFeature('sslForced', ($event.target as HTMLInputElement).checked)"
            >
          </label>
          <label class="flex items-center justify-between gap-3 text-sm">
            <span>HTTP/2 Support</span>
            <input
              type="checkbox"
              class="size-4"
              :checked="draft.http2Support"
              @change="enableSslFeature('http2Support', ($event.target as HTMLInputElement).checked)"
            >
          </label>
          <label class="flex items-center justify-between gap-3 text-sm">
            <span>HSTS Enable</span>
            <input
              type="checkbox"
              class="size-4"
              :checked="draft.hstsEnabled"
              @change="enableSslFeature('hstsEnabled', ($event.target as HTMLInputElement).checked)"
            >
          </label>
          <label class="flex items-center justify-between gap-3 text-sm">
            <span>HSTS Subdomains</span>
            <input
              v-model="draft.hstsSubdomains"
              type="checkbox"
              class="size-4"
              :disabled="!draft.hstsEnabled"
            >
          </label>
          <label class="flex items-center justify-between gap-3 text-sm">
            <span>Trust Forwarded Proto</span>
            <input
              v-model="draft.trustForwardedProto"
              type="checkbox"
              class="size-4"
            >
          </label>
        </div>
      </div>

      <div
        v-show="tab === 'advanced'"
        class="flex min-h-[14rem] flex-col gap-3"
        role="tabpanel"
      >
        <p class="text-xs text-muted">
          Placeholders: <code class="font-mono">$server</code>
          <code class="font-mono">$port</code>
          <code class="font-mono">$forward_scheme</code>
        </p>
        <UiField label="Custom nginx config">
          <textarea
            v-model="draft.advancedConfig"
            rows="10"
            class="ui-input w-full border border-rule bg-paper px-3 py-2 font-mono text-xs"
            style="border-radius: var(--radius-input)"
            placeholder="# Extra directives inside location /"
          />
        </UiField>
        <p class="text-xs text-muted">
          Stored and exported only — this stack does not reload a live reverse proxy in v1.
        </p>
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
