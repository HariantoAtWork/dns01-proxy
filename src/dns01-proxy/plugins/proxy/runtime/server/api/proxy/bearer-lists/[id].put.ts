import type { BearerListInput } from '../../../../shared/types/bearerKey'
import { toBearerListPublic } from '../../../../shared/utils/bearerKey'
import { upsertBearerList } from '../../../utils/bearerListsFile'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const body = await readBody<BearerListInput>(event)
  const { list, generatedTokens } = await upsertBearerList({
    ...(body || { name: '', keys: [] }),
    id,
  })
  return {
    list: toBearerListPublic(list),
    ...(generatedTokens.length ? { generatedTokens } : {}),
  }
})
