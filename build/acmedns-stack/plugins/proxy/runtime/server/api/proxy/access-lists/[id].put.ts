import type { AccessListInput } from '../../../../shared/types/accessList'
import { toAccessListPublic } from '../../../../shared/utils/accessList'
import { upsertAccessList } from '../../../utils/accessListsFile'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const body = await readBody<AccessListInput>(event)
  const list = await upsertAccessList({ ...(body || {}), id })
  return { list: toAccessListPublic(list) }
})
