import type { BearerKeyInput } from '../../../shared/types/bearerKey'
import { toBearerKeyPublic } from '../../../shared/utils/bearerKey'
import { upsertBearerKey } from '../../utils/bearerKeysFile'

export default defineEventHandler(async (event) => {
  const body = await readBody<BearerKeyInput>(event)
  const { key, token } = await upsertBearerKey(body || { name: '' })
  return {
    key: toBearerKeyPublic(key),
    ...(token ? { token } : {}),
  }
})
