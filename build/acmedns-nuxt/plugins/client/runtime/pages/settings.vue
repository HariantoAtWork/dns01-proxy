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

const toasts = useToasts()
const pending = ref(false)
const loaded = ref(false)
const restartBanner = ref<string[]>([])

const operator = reactive({
  acmednsUrl: '',
  defaultAcmednsUrl: '',
  letsencryptEmail: '',
  renewInterval: 12,
  certsAcmeDisabled: false,
  administratorPassword: '',
  passwordSet: false,
  tz: 'UTC',
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
  Object.assign(api, data.api)
  Object.assign(logconfig, data.logconfig)
  Object.assign(paths, data.paths)
  if (data.restartRequired && data.restartReasons?.length) {
    restartBanner.value = data.restartReasons
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
    const body: AppSettingsPutBody = {
      operator: {
        acmednsUrl: operator.acmednsUrl,
        defaultAcmednsUrl: operator.defaultAcmednsUrl,
        letsencryptEmail: operator.letsencryptEmail,
        renewInterval: Number(operator.renewInterval),
        certsAcmeDisabled: operator.certsAcmeDisabled,
        tz: operator.tz,
      },
      general: { ...general },
      database: { ...database },
      api: { ...api },
      logconfig: { ...logconfig },
    }
    if (operator.administratorPassword.trim()) {
      body.operator!.administratorPassword = operator.administratorPassword
    }
    const data = await $fetch<AppSettingsResponse>('/api/settings', {
      method: 'PUT',
      body,
    })
    applyResponse(data)
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
</script>

<template>
  <div class="mx-auto max-w-[960px] space-y-6 px-1 py-4 md:px-6 md:py-8">
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
      class="border border-danger bg-panel px-4 py-3 text-sm text-danger"
      style="border-radius: var(--radius-panel)"
    >
      Restart the container for: {{ restartBanner.join('; ') }}.
    </div>

    <UiPanel accent>
      <h2 class="text-base font-semibold tracking-tight">Operator (compose / env)</h2>
      <p class="mt-1 text-sm text-muted">
        Overrides live in <span class="font-mono text-ink">{{ paths.appSettings || 'client/app-settings.json' }}</span>.
      </p>
      <div class="mt-4 grid gap-4 md:grid-cols-2">
        <UiField label="ACMEDNS_URL" :hint="sourceLabel(operator.sources.acmednsUrl)">
          <UiInput v-model="operator.acmednsUrl" mono :disabled="pending" />
        </UiField>
        <UiField label="Register default URL" :hint="sourceLabel(operator.sources.defaultAcmednsUrl)">
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
      <label class="mt-4 flex items-center gap-2 text-sm text-ink">
        <input v-model="operator.certsAcmeDisabled" type="checkbox" class="accent-[var(--signal)]" :disabled="pending">
        CERTS_ACME_DISABLED — block production issue/renew (staging Apply still works)
        <span class="text-xs text-muted">({{ sourceLabel(operator.sources.certsAcmeDisabled) }})</span>
      </label>
    </UiPanel>

    <UiPanel>
      <h2 class="text-base font-semibold tracking-tight">Auth DNS — config.cfg [general]</h2>
      <p class="mt-1 font-mono text-xs text-muted">{{ paths.configCfg }}</p>
      <div class="mt-4 grid gap-4 md:grid-cols-2">
        <UiField label="listen">
          <UiInput v-model="general.listen" mono :disabled="pending" />
        </UiField>
        <UiField label="protocol">
          <UiInput v-model="general.protocol" mono :disabled="pending" />
        </UiField>
        <UiField label="domain">
          <UiInput v-model="general.domain" mono :disabled="pending" />
        </UiField>
        <UiField label="nsname">
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
      <UiField class="mt-4" label="records" hint="One DNS record line per row">
        <textarea
          v-model="general.records"
          class="min-h-[120px] w-full resize-y rounded-[6px] border border-rule bg-paper p-3 font-mono text-sm text-ink outline-none focus:border-signal"
          spellcheck="false"
          :disabled="pending"
        />
      </UiField>
    </UiPanel>

    <UiPanel>
      <h2 class="text-base font-semibold tracking-tight">API — [api]</h2>
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
        <label class="flex items-center gap-2 text-sm text-ink">
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

    <UiPanel>
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

    <UiPanel>
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

    <UiPanel>
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
        <dt class="text-muted">ACME_DNS_LISTEN</dt>
        <dd class="break-all text-ink">{{ paths.acmeDnsListen || '—' }}</dd>
        <dt class="text-muted">HOST</dt>
        <dd class="break-all text-ink">{{ paths.host || '—' }}</dd>
        <dt class="text-muted">NITRO_HOST</dt>
        <dd class="break-all text-ink">{{ paths.nitroHost || '—' }}</dd>
      </dl>
    </UiPanel>
  </div>
</template>
