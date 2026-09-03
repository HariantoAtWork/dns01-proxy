import { reloadRouteTable } from '../../../../server/proxy/routeTable'

export default defineNitroPlugin(() => {
  reloadRouteTable()
  console.info('[proxy] route table loaded')
})
