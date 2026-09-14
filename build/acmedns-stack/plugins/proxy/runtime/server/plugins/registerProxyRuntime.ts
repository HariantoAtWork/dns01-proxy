import { reloadRouteTable } from '../../../../../server/proxy/routeTable'
import {
  reloadAccessLists,
  reloadProxySettings,
} from '../../../../../server/proxy/accessListState'
import { reloadBearerKeys } from '../../../../../server/proxy/bearerKeyState'

export default defineNitroPlugin(() => {
  reloadRouteTable()
  reloadAccessLists()
  reloadProxySettings()
  reloadBearerKeys()
  console.info('[proxy] route table, access lists, bearer keys, and settings loaded')
})
