import type {
  AppSettingsPutBody,
  AppSettingsResponse,
  SettingSource,
} from '#shared/types/appSettings'

export function useAppSettings() {
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

  return {
    sharedMode,
    pending,
    savingTiny,
    loaded,
    restartBanner,
    sharedModeForcedByEnv,
    tinyDomain,
    tinyDomainSource,
    tinyDomainEnv,
    tinyDomainDraft,
    operator,
    general,
    database,
    api,
    logconfig,
    paths,
    sourceLabel,
    applyResponse,
    toggleTinyMode,
    saveTinyDomain,
    load,
    save,
    resetForm,
    clearOverrides,
  }
}
