import { getAcmeConfig } from '../../../../../../server/utils/config'
import { ensureSharedModeGlueRecords } from '../../../../../../server/utils/glueRecords'
import { ensureSharedModeAccount, isSharedMode } from '../../../../../../server/utils/sharedMode'
import { getAppSettingsResponse } from '../../utils/settingsService'

/**
 * Ensure Tiny mode glue (A/AAAA + NS) is written from auth domain + public IP,
 * then return current settings. DNS reads config.cfg live.
 */
export default defineEventHandler(async () => {
  const config = getAcmeConfig()
  if (!isSharedMode(config)) {
    return getAppSettingsResponse()
  }

  await ensureSharedModeGlueRecords(getAcmeConfig())
  ensureSharedModeAccount(getAcmeConfig())
  return getAppSettingsResponse()
})
