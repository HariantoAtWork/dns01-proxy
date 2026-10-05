<script setup lang="ts">
import type { ProxyHostInput } from '#proxy-shared/types/proxyHost'
import type { ProxySslAvailability } from '#proxy-shared/utils/proxyCertMatch'
import { proxySslAvailabilityClass } from '#proxy-shared/utils/proxyCertMatch'

type SslStatusPart = { text: string, live?: boolean }
type SslInfoOpen = {
  cert: boolean
  force: boolean
  http2: boolean
  hsts: boolean
  hstsSubdomains: boolean
  trustForwardedProto: boolean
}

const {
  draft,
  draftDomains,
  sslEnabled,
  boundAvailability,
  sslStatusParts,
  sslInfoOpen,
  setSslEnabled,
  enableSslFeature,
} = defineProps<{
  draft: ProxyHostInput
  draftDomains: string[]
  sslEnabled: boolean
  boundAvailability: ProxySslAvailability
  sslStatusParts: SslStatusPart[]
  sslInfoOpen: SslInfoOpen
  setSslEnabled: (enabled: boolean) => void
  enableSslFeature: (feature: 'sslForced' | 'http2Support' | 'hstsEnabled', enabled: boolean) => void
}>()
</script>

<template>
  <div
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
          <template
            v-for="(part, index) in sslStatusParts"
            :key="index"
          >
            <span :class="part.live ? 'text-live' : undefined">{{ part.text }}</span>
          </template>
        </p>
        <template #info>
          <p>
            Opts this host into SSL features (Force SSL, HSTS, HTTP/2) and binds live/ certs per domain automatically — no manual pick.
          </p>
          <p class="mt-2">
            Unlike Nginx Proxy Manager, Off does not mean HTTP-only. When Off, the status line names the leaf already on :443 from other SSL hosts (zone/parent SNI), or says none is bound yet. :80 keeps working either way.
          </p>
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
          Redirect HTTP to HTTPS for this host. Requires SSL Certificate on. Skips the redirect when the request already looks like HTTPS (e.g. X-Forwarded-Proto).
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
            :checked="sslEnabled && draft.http2Support"
            aria-label="HTTP/2 Support"
            @change="enableSslFeature('http2Support', ($event.target as HTMLInputElement).checked)"
          >
        </template>
        <template #info>
          Also serve HTTP/2 beside HTTP/1.1 on the edge HTTPS listener (ALPN). Requires SSL Certificate on. Not a replacement for h1.
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
</template>
