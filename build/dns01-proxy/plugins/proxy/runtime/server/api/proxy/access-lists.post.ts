import type { AccessListInput } from '../../../shared/types/accessList'
import { toAccessListPublic } from '../../../shared/utils/accessList'
import { upsertAccessList } from '../../utils/accessListsFile'

export default defineEventHandler(async (event) => {
  const body = await readBody<AccessListInput>(event)
  const list = await upsertAccessList(body || emptyBody())
  return { list: toAccessListPublic(list) }
})

function emptyBody(): AccessListInput {
  return {
    name: '',
    satisfyAny: false,
    passAuthUpstream: false,
    users: [],
    rules: [],
  }
}
