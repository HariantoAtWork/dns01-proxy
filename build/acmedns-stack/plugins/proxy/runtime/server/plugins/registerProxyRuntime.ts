import { reloadRouteTable } from '../../../../../server/proxy/routeTable'
import {
  reloadAccessLists,
  reloadProxySettings,
} from '../../../../../server/proxy/accessListState'
import { reloadBearerLists } from '../../../../../server/proxy/bearerKeyState'

export default defineNitroPlugin(() => {
  reloadRouteTable()
  reloadAccessLists()
  reloadProxySettings()
  reloadBearerLists()
  console.info('[proxy] route table, access lists, bearer lists, and settings loaded')
})
