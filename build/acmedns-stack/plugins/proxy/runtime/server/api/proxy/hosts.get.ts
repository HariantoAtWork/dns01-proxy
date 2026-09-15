import { listProxyHosts } from '../../utils/proxyHostsFile'

export default defineEventHandler(async () => {
  const hosts = await listProxyHosts()
  return { hosts }
})
