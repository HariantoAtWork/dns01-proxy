import {
  getLetsEncryptEmail,
  getRenewIntervalHours,
  isProductionAcmeEnabled,
  readCertSettings,
} from '../../utils/certSettings'
import { isRenewSchedulerEnabled } from '../../utils/certRenewScheduler'
import {
  getDomainsFilePath,
  getLetsencryptDir,
} from '../../../../../../server/utils/paths'

export default defineEventHandler(async () => {
  const settings = await readCertSettings()
  return {
    ...settings,
    acmeEnabled: isProductionAcmeEnabled(),
    renewSchedulerEnabled: isRenewSchedulerEnabled(),
    email: getLetsEncryptEmail(),
    renewIntervalHours: getRenewIntervalHours(),
    letsencryptDir: getLetsencryptDir(),
    domainsFile: getDomainsFilePath(),
  }
})
