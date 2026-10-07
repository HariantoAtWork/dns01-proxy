import { listAccessListsPublic } from '../../utils/accessListsFile'

export default defineEventHandler(async () => {
  const lists = await listAccessListsPublic()
  return { lists }
})
