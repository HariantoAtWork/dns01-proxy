export default defineEventHandler(async () => {
  const settings = await readCertSettings()
  return {
    ...settings,
    acmeEnabled: isAcmeEnabled(),
    email: getLetsEncryptEmail(),
    renewIntervalHours: getRenewIntervalHours(),
    certbotConfigDir: getCertbotConfigDir(),
    domainsFile: getDomainsFilePath(),
  }
})
