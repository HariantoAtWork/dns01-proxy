export default defineEventHandler(async () => {
  const settings = await readCertSettings()
  return {
    ...settings,
    acmeEnabled: isAcmeEnabled(),
    email: getLetsEncryptEmail(),
    renewIntervalHours: getRenewIntervalHours(),
    letsencryptDir: getLetsencryptDir(),
    domainsFile: getDomainsFilePath(),
  }
})
