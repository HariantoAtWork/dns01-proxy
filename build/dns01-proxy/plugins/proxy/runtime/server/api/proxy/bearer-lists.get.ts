import { listBearerListsPublic } from '../../utils/bearerListsFile'

export default defineEventHandler(async () => {
  const lists = await listBearerListsPublic()
  return { lists }
})
