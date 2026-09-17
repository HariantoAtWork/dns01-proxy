<script setup lang="ts">
import type {
  AppSettingsPutBody,
  AppSettingsResponse,
  SettingSource,
} from '#shared/types/appSettings'
import {
  PhArrowsClockwise as Reset,
  PhFloppyDisk as Save,
  PhGear as Gear,
} from '@phosphor-icons/vue'

useHead({ title: 'Settings' })

const { sharedMode, refresh: refreshSharedMode } = useSharedMode()
const toasts = useToasts()
const pending = ref(false)
const savingTiny = ref(false)
const loaded = ref(false)
const restartBanner = ref<string[]>([])
const sharedModeForcedByEnv = ref(false)
const tinyDomain = ref('')
const tinyDomainSource = ref<SettingSource | undefined>()
const tinyDomainEnv = ref('')
const tinyDomainDraft = ref('')

const operator = reactive({
  acmednsUrl: '',
  defaultAcmednsUrl: '',
  letsencryptEmail: '',
  renewInterval: 12,
  certsAcmeDisabled: false,
  certsRenewDisabled: false,
  administratorPassword: '',
  passwordSet: false,
  tz: 'UTC',
  acmeTxtSettleMs: 5000,
  acmeTxtHoldMs: 300000,
  authHop: false,
  sources: {} as AppSettingsResponse['operator']['sources'],
})

const general = reactive({
  listen: '',
  protocol: 'both',
  domain: '',
  nsname: '',
  nsadmin: '',
  records: '',
  debug: false,
})

const database = reactive({
  engine: 'sqlite',
  connection: '',
})

const api = reactive({
  ip: '0.0.0.0',
  port: '80',
  disable_registration: false,
  shared_mode: false,
  shared_username: '',
  shared_password: '',
  sharedPasswordSet: false,
  auth_hop: false,
  tls: 'none',
  tls_cert_fullchain: '',
  tls_cert_privkey: '',
  corsorigins: '*',
  use_header: false,
  header_name: 'X-Forwarded-For',
})

const logconfig = reactive({
  loglevel: 'info',
  logtype: 'stdout',
  logformat: 'text',
})

const paths = reactive({
  dataRoot: '',
  letsencryptDir: '',
  configCfg: '',
  appSettings: '',
  acmeDnsListen: '',
  host: '',
  nitroHost: '',
})

function sourceLabel(source: SettingSource | undefined) {
  switch (source) {
    case 'app-settings':
      return 'dashboard override'
    case 'compose/env':
      return 'compose / env'
    case 'config.cfg':
      return 'config.cfg'
    default:
      return 'default'
  }
}

function applyResponse(data: AppSettingsResponse) {
  Object.assign(operator, {
    ...data.operator,
    administratorPassword: '',
  })
  Object.assign(general, data.general)
  Object.assign(database, data.database)
  Object.assign(api, {
    ...data.api,
    shared_password: '',
  })
  Object.assign(logconfig, data.logconfig)
  Object.assign(paths, data.paths)
  sharedModeForcedByEnv.value = Boolean(data.sharedModeForcedByEnv)
  tinyDomain.value = data.tinyDomain || ''
  tinyDomainSource.value = data.tinyDomainSource
  tinyDomainEnv.value = data.tinyDomainEnv || ''
  tinyDomainDraft.value = data.tinyDomain
    || (data.api?.shared_mode ? data.general.domain : '')
    || ''
  if (data.restartRequired && data.restartReasons?.length) {
    restartBanner.value = data.restartReasons
  }
}

async function toggleTinyMode() {
  if (pending.value || !loaded.value || sharedModeForcedByEnv.value) {
    return
  }
  const next = !api.shared_mode
  api.shared_mode = next
  if (next) {
    api.disable_registration = true
  }
  pending.value = true
  try {
    const data = await $fetch<AppSettingsResponse>('/api/settings', {
      method: 'PUT',
      body: {
        api: {
          shared_mode: next,
          ...(next ? { disable_registration: true } : {}),
        },
      } satisfies AppSettingsPutBody,
    })
    applyResponse(data)
    await refreshSharedMode()
    toasts.ok(next ? 'Tiny mode on' : 'Tiny mode off')
  }
  catch (caught) {
    api.shared_mode = !next
    toasts.error(caught instanceof Error ? caught.message : 'Failed to toggle Tiny mode')
  }
  finally {
    pending.value = false
  }
}

async function saveTinyDomain() {
  if (!loaded.value || savingTiny.value) {
    return
  }
  const next = tinyDomainDraft.value.trim()
  if (next === tinyDomain.value) {
    return
  }
  savingTiny.value = true
  try {
    const data = await $fetch<AppSettingsResponse>('/api/settings', {
      method: 'PUT',
      body: {
        operator: { tinyDomain: next },
        // Keep shared mode on when setting an auth domain from the Tiny panel.
        ...(next ? { api: { shared_mode: true, disable_registration: true } } : {}),
      } satisfies AppSettingsPutBody,
    })
    applyResponse(data)
    await refreshSharedMode()
    toasts.ok(next ? `Tiny domain → ${data.tinyDomain}` : 'Tiny domain cleared')
  }
  catch (caught) {
    tinyDomainDraft.value = tinyDomain.value
      || (api.shared_mode ? general.domain : '')
      || ''
    toasts.error(caught instanceof Error ? caught.message : 'Failed to save Tiny domain')
  }
  finally {
    savingTiny.value = false
  }
}

async function load() {
  pending.value = true
  try {
    const data = await $fetch<AppSettingsResponse>('/api/settings')
    applyResponse(data)
    loaded.value = true
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Failed to load settings')
  }
  finally {
    pending.value = false
  }
}

async function save() {
  pending.value = true
  try {
    const apiBody: AppSettingsPutBody['api'] = {
      ip: api.ip,
      port: api.port,
      shared_mode: api.shared_mode,
      tls: api.tls,
      tls_cert_fullchain: api.tls_cert_fullchain,
      tls_cert_privkey: api.tls_cert_privkey,
      corsorigins: api.corsorigins,
      use_header: api.use_header,
      header_name: api.header_name,
    }
    if (!api.shared_mode) {
      apiBody.disable_registration = api.disable_registration
    }
    const generalBody = api.shared_mode
      ? {
          listen: general.listen,
          protocol: general.protocol,
          nsadmin: general.nsadmin,
          debug: general.debug,
        }
      : { ...general }
    const body: AppSettingsPutBody = {
      operator: {
        acmednsUrl: operator.acmednsUrl,
        defaultAcmednsUrl: operator.defaultAcmednsUrl,
        letsencryptEmail: operator.letsencryptEmail,
        renewInterval: Number(operator.renewInterval),
        certsAcmeDisabled: operator.certsAcmeDisabled,
        certsRenewDisabled: operator.certsRenewDisabled,
        tz: operator.tz,
        acmeTxtSettleMs: Number(operator.acmeTxtSettleMs),
        acmeTxtHoldMs: Number(operator.acmeTxtHoldMs),
        authHop: Boolean(operator.authHop),
      },
      general: generalBody,
      database: { ...database },
      api: apiBody,
      logconfig: { ...logconfig },
    }
    // Only send tinyDomain when non-empty so a blank draft cannot wipe a stored override.
    const tinyDraft = tinyDomainDraft.value.trim()
    if (api.shared_mode && tinyDraft) {
      body.operator!.tinyDomain = tinyDraft
    }
    if (operator.administratorPassword.trim()) {
      body.operator!.administratorPassword = operator.administratorPassword
    }
    const data = await $fetch<AppSettingsResponse>('/api/settings', {
      method: 'PUT',
      body,
    })
    applyResponse(data)
    await refreshSharedMode()
    if (data.restartRequired) {
      toasts.info(
        (data.restartReasons || ['Bind settings changed']).join('; '),
        'Saved — restart required',
      )
    }
    else {
      toasts.ok('Settings saved')
    }
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Save failed')
  }
  finally {
    pending.value = false
  }
}

async function resetForm() {
  restartBanner.value = []
  await load()
  toasts.info('Reloaded from disk / effective values', 'Reset')
}

async function clearOverrides() {
  pending.value = true
  try {
    const data = await $fetch<AppSettingsResponse>('/api/settings', {
      method: 'PUT',
      body: { clearOperatorOverrides: true },
    })
    applyResponse(data)
    toasts.ok('Operator overrides cleared — compose/env applies again')
  }
  catch (caught) {
    toasts.error(caught instanceof Error ? caught.message : 'Clear failed')
  }
  finally {
    pending.value = false
  }
}

onMounted(() => {
  void load()
})

const tocItems: Array<{ id: string, label: string }> = [
  { id: 'settings-tiny', label: 'Tiny mode' },
  { id: 'settings-operator', label: 'Operator' },
  { id: 'settings-txt', label: 'TXT' },
  { id: 'settings-general', label: 'Auth DNS' },
  { id: 'settings-api', label: 'API' },
  { id: 'settings-database', label: 'Database' },
  { id: 'settings-logconfig', label: 'Logging' },
  { id: 'settings-paths', label: 'Paths' },
]
</script>

<template>
  <div class="mx-auto max-w-[1100px] px-1 py-4 md:px-6 md:py-8">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="flex items-center gap-2 text-xl font-semibold text-ink md:text-2xl">
          <Gear :size="24" weight="regular" aria-hidden="true" />
          Settings
        </h1>
        <p class="mt-1 max-w-[65ch] text-sm text-muted">
          Edit operator (compose) values and <span class="font-mono text-ink">config.cfg</span> without rebuilding the image.
          Save writes the data volume. Reset reloads the form. Clear overrides drops dashboard ACME overrides so compose env wins again.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UiButton variant="ghost" size="sm" :disabled="pending" @click="resetForm">
          <Reset :size="14" weight="regular" aria-hidden="true" />
          Reset
        </UiButton>
        <UiButton variant="ghost" size="sm" :disabled="pending" @click="clearOverrides">
          Clear overrides
        </UiButton>
        <UiButton size="sm" :disabled="pending || !loaded" @click="save">
          <Save :size="14" weight="regular" aria-hidden="true" />
          Save
        </UiButton>
      </div>
    </div>

    <div
      v-if="restartBanner.length"
      class="mt-6 border border-danger bg-panel px-4 py-3 text-sm text-danger"
      style="border-radius: var(--radius-panel)"
    >
      Restart the container for: {{ restartBanner.join('; ') }}.
    </div>

    <div class="mt-6 flex flex-col gap-6 lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-start lg:gap-8">
      <aside class="sticky top-3 z-[1] -mx-1 border-b border-rule bg-paper/95 px-1 py-2 backdrop-blur-sm lg:top-6 lg:mx-0 lg:border-b-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
        <SettingsToc :items="tocItems" />
      </aside>

      <div class="min-w-0 space-y-6">
    <UiPanel id="settings-tiny" class="scroll-mt-20 lg:scroll-mt-6" accent>
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="min-w-0">
          <h2 class="text-base font-semibold tracking-tight">Tiny mode</h2>
          <p class="mt-1 max-w-[55ch] text-sm text-muted">
            Shared auth zone — no Register step, challenge CNAMEs target the apex.
            Sets <span class="font-mono text-ink">domain</span> / <span class="font-mono text-ink">nsname</span>
            and <span class="font-mono text-ink">shared_mode</span>.
          </p>
          <template v-if="api.shared_mode">
            <UiField
              class="mt-3 max-w-md"
              label="ACMEDNS_TINY_DOMAIN"
              :hint="tinyDomainSource ? sourceLabel(tinyDomainSource) : undefined"
            >
              <UiInput
                v-model="tinyDomainDraft"
                mono
                placeholder="auth.example.org"
                :disabled="!loaded || sharedModeForcedByEnv"
                @keydown.enter.prevent="saveTinyDomain"
                @blur="saveTinyDomain"
              />
            </UiField>
            <p v-if="tinyDomainEnv && tinyDomainSource === 'app-settings'" class="mt-2 font-mono text-xs text-muted">
              compose/env: {{ tinyDomainEnv }}
            </p>
            <p v-if="sharedModeForcedByEnv" class="mt-2 text-xs text-danger">
              Locked by compose/env <span class="font-mono">ACMEDNS_TINY_DOMAIN={{ tinyDomainEnv }}</span>.
            </p>
          </template>
          <p v-else class="mt-2 text-xs text-muted">
            Toggle saves immediately (dashboard override wins over
            <span class="font-mono">ACMEDNS_TINY_MODE</span>). Clear overrides to fall back to compose/env.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          class="relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors"
          :class="api.shared_mode ? 'border-signal bg-signal' : 'border-rule bg-panel'"
          :aria-checked="api.shared_mode"
          aria-label="Tiny mode"
          :disabled="pending || !loaded || sharedModeForcedByEnv"
          @click="toggleTinyMode"
        >
          <span
            class="inline-block size-6 rounded-full bg-paper shadow transition-transform"
            :class="api.shared_mode ? 'translate-x-7' : 'translate-x-1'"
          />
        </button>
      </div>
      <p class="mt-3 text-xs text-muted">
        {{ api.shared_mode ? 'On' : 'Off' }} — applies immediately. Domains becomes DNS setup; registration is disabled while on.
      </p>
      <SharedTinySummary v-if="api.shared_mode" class="mt-4" />
    </UiPanel>

    <UiPanel id="settings-operator" class="scroll-mt-20 lg:scroll-mt-6" accent>
      <h2 class="text-base font-semibold tracking-tight">Operator (compose / env)</h2>
      <p class="mt-1 text-sm text-muted">
        Overrides live in <span class="font-mono text-ink">{{ paths.appSettings || 'client/app-settings.json' }}</span>.
      </p>
      <div class="mt-4 grid gap-4 md:grid-cols-2">
        <UiField label="ACMEDNS_URL" :hint="sourceLabel(operator.sources.acmednsUrl)">
          <UiInput v-model="operator.acmednsUrl" mono :disabled="pending" />
        </UiField>
        <UiField
          v-if="!sharedMode"
          label="Register default URL"
          :hint="sourceLabel(operator.sources.defaultAcmednsUrl)"
        >
          <UiInput v-model="operator.defaultAcmednsUrl" mono :disabled="pending" />
        </UiField>
        <UiField label="LETSENCRYPT_EMAIL" :hint="sourceLabel(operator.sources.letsencryptEmail)">
          <UiInput v-model="operator.letsencryptEmail" :disabled="pending" />
        </UiField>
        <UiField label="RENEW_INTERVAL (hours)" :hint="sourceLabel(operator.sources.renewInterval)">
          <UiInput
            :model-value="String(operator.renewInterval)"
            mono
            :disabled="pending"
            @update:model-value="operator.renewInterval = Math.max(1, Number($event) || 12)"
          />
        </UiField>
        <UiField label="TZ" :hint="sourceLabel(operator.sources.tz)">
          <UiInput v-model="operator.tz" mono :disabled="pending" />
        </UiField>
        <UiField
          label="ADMINISTRATOR_PASSWORD"
          :hint="`${sourceLabel(operator.sources.administratorPassword)}${operator.passwordSet ? ' · password is set' : ' · open access'}`"
        >
          <UiPasswordInput
            v-model="operator.administratorPassword"
            :disabled="pending"
            placeholder="Leave blank to keep current"
          />
        </UiField>
      </div>
      <label class="mt-4 flex items-start gap-2 text-sm text-ink">
        <input v-model="operator.certsAcmeDisabled" type="checkbox" class="mt-0.5 accent-[var(--signal)]" :disabled="pending">
        <span>
          CERTS_ACME_DISABLED — block production issue/renew
          <span class="block text-xs text-muted">
            Staging Apply still works. ({{ sourceLabel(operator.sources.certsAcmeDisabled) }})
          </span>
        </span>
      </label>
      <label class="mt-3 flex items-start gap-2 text-sm text-ink">
        <input v-model="operator.certsRenewDisabled" type="checkbox" class="mt-0.5 accent-[var(--signal)]" :disabled="pending">
        <span>
          CERTS_RENEW_DISABLED — stop the renew scheduler only
          <span class="block text-xs text-muted">
            Periodic production renew off. Manual Apply / Force re-issue still work.
            ({{ sourceLabel(operator.sources.certsRenewDisabled) }})
          </span>
        </span>
      </label>
    </UiPanel>

    <UiPanel id="settings-txt" class="scroll-mt-20 lg:scroll-mt-6" accent>
      <h2 class="text-base font-semibold tracking-tight">Challenge TXT timing</h2>
      <p class="mt-1 text-sm text-muted">
        Store lifetime = settle + hold. Dashboard overrides win over compose
        <span class="font-mono text-ink">ACME_TXT_SETTLE_MS</span> /
        <span class="font-mono text-ink">ACME_TXT_HOLD_MS</span>.
      </p>
      <div class="mt-4 grid gap-4 md:grid-cols-2">
        <UiField
          label="ACME_TXT_SETTLE_MS"
          :hint="`${sourceLabel(operator.sources.acmeTxtSettleMs)} · pause after TXT online before LE validate (0 disables)`"
        >
          <UiInput
            :model-value="String(operator.acmeTxtSettleMs)"
            mono
            :disabled="pending"
            @update:model-value="operator.acmeTxtSettleMs = Math.max(0, Number($event) || 0)"
          />
        </UiField>
        <UiField
          label="ACME_TXT_HOLD_MS"
          :hint="`${sourceLabel(operator.sources.acmeTxtHoldMs)} · extra TXT retention after settle`"
        >
          <UiInput
            :model-value="String(operator.acmeTxtHoldMs)"
            mono
            :disabled="pending"
            @update:model-value="operator.acmeTxtHoldMs = Math.max(1, Number($event) || 1)"
          />
        </UiField>
      </div>
      <label
        v-if="api.shared_mode"
        class="mt-4 flex items-start gap-2 text-sm text-ink"
      >
        <input
          v-model="operator.authHop"
          type="checkbox"
          class="mt-0.5 accent-[var(--signal)]"
          :disabled="pending"
        >
        <span>
          ACMEDNS_AUTH_HOP — per-authorization UUID CNAME hop
          <span class="block text-xs text-muted">
            Point Cloudflare at <span class="font-mono">any-label.auth.zone</span>; this server answers
            that label → fresh UUID (TXT only on the UUID). ({{ sourceLabel(operator.sources.authHop) }})
          </span>
        </span>
      </label>
    </UiPanel>

    <UiPanel id="settings-general" class="scroll-mt-20 lg:scroll-mt-6">
      <h2 class="text-base font-semibold tracking-tight">Auth DNS — config.cfg [general]</h2>
      <p class="mt-1 font-mono text-xs text-muted">{{ paths.configCfg }}</p>
      <p v-if="api.shared_mode" class="mt-2 text-sm text-muted">
        Auth zone, nsname, and glue records are managed by Tiny mode above — not edited here.
      </p>
      <div class="mt-4 grid gap-4 md:grid-cols-2">
        <UiField label="listen">
          <UiInput v-model="general.listen" mono :disabled="pending" />
        </UiField>
        <UiField label="protocol">
          <UiInput v-model="general.protocol" mono :disabled="pending" />
        </UiField>
        <UiField
          v-if="!api.shared_mode"
          label="domain"
        >
          <UiInput v-model="general.domain" mono :disabled="pending" />
        </UiField>
        <UiField
          v-if="!api.shared_mode"
          label="nsname"
        >
          <UiInput v-model="general.nsname" mono :disabled="pending" />
        </UiField>
        <UiField label="nsadmin">
          <UiInput v-model="general.nsadmin" mono :disabled="pending" />
        </UiField>
        <label class="flex items-center gap-2 self-end text-sm text-ink">
          <input v-model="general.debug" type="checkbox" class="accent-[var(--signal)]" :disabled="pending">
          debug
        </label>
      </div>
      <UiField
        v-if="!api.shared_mode"
        class="mt-4"
        label="records"
        hint="One DNS record line per row"
      >
        <textarea
          v-model="general.records"
          class="min-h-[120px] w-full resize-y rounded-[6px] border border-rule bg-paper p-3 font-mono text-sm text-ink outline-none focus:border-signal"
          spellcheck="false"
          :disabled="pending"
        />
      </UiField>
    </UiPanel>

    <UiPanel id="settings-api" class="scroll-mt-20 lg:scroll-mt-6">
      <h2 class="text-base font-semibold tracking-tight">API — [api]</h2>
      <p v-if="api.shared_mode" class="mt-1 text-sm text-muted">
        Registration stays disabled while Tiny mode is on.
      </p>
      <div class="mt-4 grid gap-4 md:grid-cols-2">
        <UiField label="ip">
          <UiInput v-model="api.ip" mono :disabled="pending" />
        </UiField>
        <UiField label="port">
          <UiInput v-model="api.port" mono :disabled="pending" />
        </UiField>
        <UiField label="tls" hint='Use "none" behind Cloudflare; "cert" needs PEM paths below'>
          <UiInput v-model="api.tls" mono :disabled="pending" />
        </UiField>
        <UiField label="header_name">
          <UiInput v-model="api.header_name" mono :disabled="pending" />
        </UiField>
        <UiField
          class="md:col-span-2"
          label="tls_cert_fullchain"
          hint="Container path — only when tls = cert"
        >
          <UiInput v-model="api.tls_cert_fullchain" mono :disabled="pending || api.tls !== 'cert'" />
        </UiField>
        <UiField
          class="md:col-span-2"
          label="tls_cert_privkey"
          hint="Container path — only when tls = cert"
        >
          <UiInput v-model="api.tls_cert_privkey" mono :disabled="pending || api.tls !== 'cert'" />
        </UiField>
        <label
          v-if="!api.shared_mode"
          class="flex items-center gap-2 text-sm text-ink"
        >
          <input v-model="api.disable_registration" type="checkbox" class="accent-[var(--signal)]" :disabled="pending">
          disable_registration
        </label>
        <label class="flex items-center gap-2 text-sm text-ink">
          <input v-model="api.use_header" type="checkbox" class="accent-[var(--signal)]" :disabled="pending">
          use_header
        </label>
      </div>
      <UiField class="mt-4" label="corsorigins" hint="Comma or newline separated">
        <textarea
          v-model="api.corsorigins"
          class="min-h-[72px] w-full resize-y rounded-[6px] border border-rule bg-paper p-3 font-mono text-sm text-ink outline-none focus:border-signal"
          spellcheck="false"
          :disabled="pending"
        />
      </UiField>
    </UiPanel>

    <UiPanel id="settings-database" class="scroll-mt-20 lg:scroll-mt-6">
      <h2 class="text-base font-semibold tracking-tight">Database — [database]</h2>
      <div class="mt-4 grid gap-4 md:grid-cols-2">
        <UiField label="engine">
          <UiInput v-model="database.engine" mono :disabled="pending" />
        </UiField>
        <UiField label="connection">
          <UiInput v-model="database.connection" mono :disabled="pending" />
        </UiField>
      </div>
    </UiPanel>

    <UiPanel id="settings-logconfig" class="scroll-mt-20 lg:scroll-mt-6">
      <h2 class="text-base font-semibold tracking-tight">Logging — [logconfig]</h2>
      <div class="mt-4 grid gap-4 md:grid-cols-3">
        <UiField label="loglevel">
          <UiInput v-model="logconfig.loglevel" mono :disabled="pending" />
        </UiField>
        <UiField label="logtype">
          <UiInput v-model="logconfig.logtype" mono :disabled="pending" />
        </UiField>
        <UiField label="logformat">
          <UiInput v-model="logconfig.logformat" mono :disabled="pending" />
        </UiField>
      </div>
    </UiPanel>

    <UiPanel id="settings-paths" class="scroll-mt-20 lg:scroll-mt-6">
      <h2 class="text-base font-semibold tracking-tight">Paths (read-only)</h2>
      <p class="mt-1 text-sm text-muted">Must match compose volumes / bind; change via compose, not here.</p>
      <dl class="mt-3 grid gap-2 font-mono text-xs md:grid-cols-[10rem_minmax(0,1fr)]">
        <dt class="text-muted">ACMEDNS_DATA_ROOT</dt>
        <dd class="break-all text-ink">{{ paths.dataRoot || '—' }}</dd>
        <dt class="text-muted">LETSENCRYPT_DIR</dt>
        <dd class="break-all text-ink">{{ paths.letsencryptDir || '—' }}</dd>
        <dt class="text-muted">config.cfg</dt>
        <dd class="break-all text-ink">{{ paths.configCfg || '—' }}</dd>
        <dt class="text-muted">app-settings</dt>
        <dd class="break-all text-ink">{{ paths.appSettings || '—' }}</dd>
        <template v-if="api.shared_mode">
          <dt class="text-muted">ACMEDNS_TINY_DOMAIN</dt>
          <dd class="break-all text-ink">
            {{ tinyDomain || '—' }}
            <span v-if="tinyDomainSource" class="text-muted"> ({{ sourceLabel(tinyDomainSource) }})</span>
          </dd>
        </template>
        <dt class="text-muted">ACME_DNS_LISTEN</dt>
        <dd class="break-all text-ink">{{ paths.acmeDnsListen || '—' }}</dd>
        <dt class="text-muted">HOST</dt>
        <dd class="break-all text-ink">{{ paths.host || '—' }}</dd>
        <dt class="text-muted">NITRO_HOST</dt>
        <dd class="break-all text-ink">{{ paths.nitroHost || '—' }}</dd>
      </dl>
    </UiPanel>
      </div>
    </div>
  </div>
</template>
