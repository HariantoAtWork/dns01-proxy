import { getAppSettingsResponse } from '../../utils/settingsService'

export default defineEventHandler(() => {
  return getAppSettingsResponse()
})
