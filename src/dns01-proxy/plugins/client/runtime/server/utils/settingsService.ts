import type {
  AppSettingsPutBody,
  AppSettingsResponse,
} from '#shared/types/appSettings'
import { getAcmeConfig } from '../../../../../server/utils/config'
import { bindRestartReasons, writeAcmeConfigFile } from '../../../../../server/utils/configWrite'
import { tinyDomainFromEnv } from '#shared/utils/tinyDomain'
import {
  readAppSettingsFile,
  resolveTinyDomain,
  writeAppSettingsFile,
} from './appSettings'
import {
  applyApi,
  applyDatabase,
  applyGeneral,
  applyLog,
} from './settingsConfigPatch'
import { applyOperator } from './settingsOperator'
import { getAppSettingsResponse } from './settingsViews'

export { getAppSettingsResponse }

export async function updateAppSettings(body: AppSettingsPutBody): Promise<AppSettingsResponse> {
  const before = JSON.parse(JSON.stringify(getAcmeConfig())) as ReturnType<typeof getAcmeConfig>
  let configTouched = false
  const tinyDomainPatched = body.operator?.tinyDomain !== undefined && body.operator?.tinyDomain !== null

  if (body.clearOperatorOverrides || body.operator) {
    await applyOperator(body.operator || {}, Boolean(body.clearOperatorOverrides))
  }

  if (tinyDomainPatched || body.clearOperatorOverrides) {
    const { resetAcmeConfigCache } = await import('../../../../../server/utils/config')
    resetAcmeConfigCache()
  }

  const next = JSON.parse(JSON.stringify(getAcmeConfig())) as ReturnType<typeof getAcmeConfig>

  // Tiny domain from app-settings already applied via getAcmeConfig — persist domain/nsname/shared_mode.
  if (tinyDomainPatched) {
    const tiny = resolveTinyDomain().value
    if (tiny) {
      next.general.domain = tiny
      next.general.nsname = tiny
      next.api.shared_mode = true
      next.api.disable_registration = true
    }
    configTouched = true
  }

  // Apply API first so shared_mode is known before general.domain / nsname locks.
  if (body.api) {
    applyApi(next, body.api)
    configTouched = true
  }
  if (body.general) {
    applyGeneral(next, body.general)
    configTouched = true
  }
  if (body.database) {
    applyDatabase(next, body.database)
    configTouched = true
  }
  if (body.logconfig) {
    applyLog(next, body.logconfig)
    configTouched = true
  }

  let restartReasons: string[] = []
  if (configTouched) {
    restartReasons = bindRestartReasons(before, next)
    await writeAcmeConfigFile(next)

    if (body.api?.shared_mode !== undefined && !tinyDomainFromEnv()) {
      const current = await readAppSettingsFile()
      const nextSettings: typeof current = {
        ...current,
        sharedMode: Boolean(body.api.shared_mode),
      }
      // Turning Tiny mode off clears the dashboard tiny-domain override so it can stay off.
      if (!body.api.shared_mode) {
        delete nextSettings.tinyDomain
      }
      await writeAppSettingsFile(nextSettings)
      const { resetAcmeConfigCache } = await import('../../../../../server/utils/config')
      resetAcmeConfigCache()
    }

    if (getAcmeConfig().api.shared_mode) {
      const { ensureSharedModeGlueRecords } = await import('../../../../../server/utils/glueRecords')
      const { ensureSharedModeAccount } = await import('../../../../../server/utils/sharedModeBootstrap')
      await ensureSharedModeGlueRecords(getAcmeConfig())
      ensureSharedModeAccount(getAcmeConfig())
    }
  }

  const response = getAppSettingsResponse()
  if (restartReasons.length) {
    response.restartRequired = true
    response.restartReasons = restartReasons
  }
  return response
}
