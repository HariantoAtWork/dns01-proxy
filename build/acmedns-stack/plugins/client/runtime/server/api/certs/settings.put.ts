import {
  assertDirectoryMode,
  getLetsEncryptEmail,
  getRenewIntervalHours,
  isProductionAcmeEnabled,
  readCertSettings,
  writeCertSettings,
} from '../../utils/certSettings'
import {
  isRenewSchedulerEnabled,
  setRenewSchedulerEnabled,
} from '../../utils/certRenewScheduler'
import {
  getDomainsFilePath,
  getLetsencryptDir,
} from '../../../../../../server/utils/paths'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    directoryMode?: unknown
    renewSchedulerEnabled?: unknown
  }>(event)

  let directoryMode = (await readCertSettings()).directoryMode
  if (body?.directoryMode !== undefined) {
    directoryMode = assertDirectoryMode(body.directoryMode)
    await writeCertSettings({ directoryMode })
  }

  let renewSchedulerEnabled = isRenewSchedulerEnabled()
  if (typeof body?.renewSchedulerEnabled === 'boolean') {
    renewSchedulerEnabled = await setRenewSchedulerEnabled(body.renewSchedulerEnabled)
  }

  return {
    directoryMode,
    acmeEnabled: isProductionAcmeEnabled(),
    renewSchedulerEnabled,
    email: getLetsEncryptEmail(),
    renewIntervalHours: getRenewIntervalHours(),
    letsencryptDir: getLetsencryptDir(),
    domainsFile: getDomainsFilePath(),
  }
})
