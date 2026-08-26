import type { AppSettingsPutBody } from '#shared/types/appSettings'
import { updateAppSettings } from '../../utils/settingsService'

export default defineEventHandler(async (event) => {
  const body = await readBody<AppSettingsPutBody>(event).catch(() => ({} as AppSettingsPutBody))
  return updateAppSettings(body || {})
})
