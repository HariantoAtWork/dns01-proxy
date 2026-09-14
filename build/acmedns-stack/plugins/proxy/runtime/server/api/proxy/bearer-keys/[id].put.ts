import type { BearerKeyInput } from '../../../../shared/types/bearerKey'
import { toBearerKeyPublic } from '../../../../shared/utils/bearerKey'
import { upsertBearerKey } from '../../../utils/bearerKeysFile'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }
  const body = await readBody<BearerKeyInput>(event)
  const { key } = await upsertBearerKey({ ...(body || { name: '' }), id })
  return { key: toBearerKeyPublic(key) }
})
