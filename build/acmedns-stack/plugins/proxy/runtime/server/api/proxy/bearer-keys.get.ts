import { listBearerKeysPublic } from '../../utils/bearerKeysFile'

export default defineEventHandler(async () => {
  const keys = await listBearerKeysPublic()
  return { keys }
})
