import { readProxySettings } from '../../utils/proxySettingsFile'

export default defineEventHandler(async () => {
  const settings = await readProxySettings()
  return { settings }
})
