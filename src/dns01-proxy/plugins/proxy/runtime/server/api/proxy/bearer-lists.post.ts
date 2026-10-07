import type { BearerListInput } from '../../../shared/types/bearerKey'
import { toBearerListPublic } from '../../../shared/utils/bearerKey'
import { upsertBearerList } from '../../utils/bearerListsFile'

export default defineEventHandler(async (event) => {
  const body = await readBody<BearerListInput>(event)
  const { list, generatedTokens } = await upsertBearerList(body || { name: '', keys: [] })
  return {
    list: toBearerListPublic(list),
    ...(generatedTokens.length ? { generatedTokens } : {}),
  }
})
