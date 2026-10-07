import type { ComputedRef, Ref } from 'vue'
import type { ProxyHost, ProxyHostInput } from '#proxy-shared/types/proxyHost'
import type { ProxyCertCandidate } from '#proxy-shared/utils/proxyCertMatch'
import {
  PROXY_SSL_AUTO,
  activeEdgeSslForDomains,
  poolSslCoverage,
  proxyHostSslAvailability,
  proxySslAvailabilityLabel,
  proxySslCertLabel,
  resolveCertificatesForDomains,
} from '#proxy-shared/utils/proxyCertMatch'

type SslStatusPart = { text: string, live?: boolean }

export function useProxyHostSsl(deps: {
  draft: Ref<ProxyHostInput>
  draftDomains: ComputedRef<string[]>
  certEntries: MaybeRefOrGetter<ProxyCertCandidate[]>
  existingHosts: MaybeRefOrGetter<Array<Pick<ProxyHost, 'id' | 'domainNames' | 'enabled' | 'certificateName'>>>
  formError: Ref<string | null>
  duplicateWarning: ComputedRef<string | null>
}) {
  const {
    draft,
    draftDomains,
    formError,
    duplicateWarning,
  } = deps

  const certEntries = computed(() => toValue(deps.certEntries))
  const existingHosts = computed(() => toValue(deps.existingHosts))

  const sslInfoOpen = reactive({
    cert: false,
    force: false,
    http2: false,
    hsts: false,
    hstsSubdomains: false,
    trustForwardedProto: false,
  })

  function resetSslInfoOpen() {
    sslInfoOpen.cert = false
    sslInfoOpen.force = false
    sslInfoOpen.http2 = false
    sslInfoOpen.hsts = false
    sslInfoOpen.hstsSubdomains = false
    sslInfoOpen.trustForwardedProto = false
  }

  const sslBinding = computed(() =>
    resolveCertificatesForDomains(draftDomains.value, certEntries.value),
  )

  const sslEnabled = computed(() => Boolean(draft.value.certificateName))

  const boundAvailability = computed(() =>
    proxyHostSslAvailability(draft.value.certificateName, draftDomains.value, certEntries.value),
  )

  const edgeSslWhenOff = computed(() =>
    activeEdgeSslForDomains(
      draftDomains.value,
      existingHosts.value,
      certEntries.value,
      draft.value.id,
    ),
  )

  const sslStatusParts = computed((): SslStatusPart[] => {
    if (!draftDomains.value.length) {
      return [{ text: 'Add domain names on Details first.' }]
    }
    if (!sslEnabled.value) {
      const edge = edgeSslWhenOff.value
      if (edge.fullyCovered) {
        return [
          { text: 'Off — SSL features off. HTTPS active via ' },
          { text: edge.certNames.join(', '), live: true },
          { text: ' (zone SNI from other SSL hosts).' },
        ]
      }
      if (edge.covered > 0) {
        return [
          { text: 'Off — SSL features off. HTTPS via ' },
          { text: edge.certNames.join(', '), live: true },
          { text: ` for ${edge.covered}/${edge.total} domains; not on edge: ${edge.uncoveredDomains.join(', ')}.` },
        ]
      }
      if (sslBinding.value) {
        return [
          { text: 'Off — SSL features off. Live cert ready (' },
          { text: sslBinding.value.certNames.join(', '), live: true },
          { text: ') but not on :443 yet — turn SSL on to bind it for this host.' },
        ]
      }
      const pool = poolSslCoverage(draftDomains.value, certEntries.value)
      if (pool.availability === 'some') {
        return [{ text: `Off — SSL features off. Only ${pool.covered}/${pool.total} domains have a live cert; none are on :443 for this host.` }]
      }
      return [{ text: 'Off — SSL features off. No matching leaf on :443 for this host.' }]
    }
    const label = proxySslAvailabilityLabel(boundAvailability.value)
    const certs = proxySslCertLabel(draft.value.certificateName, draftDomains.value, certEntries.value)
    return [
      { text: `On — ${label} · ` },
      { text: certs, live: true },
    ]
  })

  /** Enable SSL when every domain is covered by some live cert (may be several certs). */
  function applyLiveCertificates(): boolean {
    const binding = resolveCertificatesForDomains(draftDomains.value, certEntries.value)
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
    if (!resolveCertificatesForDomains(draftDomains.value, certEntries.value)) {
      clearSsl()
      return
    }
    draft.value.certificateName = PROXY_SSL_AUTO
  })

  return {
    sslInfoOpen,
    resetSslInfoOpen,
    sslEnabled,
    boundAvailability,
    sslStatusParts,
    applyLiveCertificates,
    clearSsl,
    setSslEnabled,
    enableSslFeature,
  }
}
