import { reloadRouteTable } from '../../../../../server/proxy/routeTable'
import {
  reloadAccessLists,
  reloadProxySettings,
} from '../../../../../server/proxy/accessListState'

export default defineNitroPlugin(() => {
  reloadRouteTable()
  reloadAccessLists()
  reloadProxySettings()
  console.info('[proxy] route table, access lists, and settings loaded')
})
