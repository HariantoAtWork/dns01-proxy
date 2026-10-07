import type { ProxySettings } from '../../../shared/types/accessList'
import { writeProxySettings } from '../../utils/proxySettingsFile'

export default defineEventHandler(async (event) => {
  const body = await readBody<Partial<ProxySettings>>(event)
  const settings = await writeProxySettings(body || {})
  return { settings }
})
