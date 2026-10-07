import type { StorageMutationResult } from '#shared/types/clientstorage'

export default defineEventHandler(async (event): Promise<StorageMutationResult> => {
  const domain = getRouterParam(event, 'domain')

  if (!domain) {
    return { success: false, message: 'Domain not found' }
  }

  const data = await readStorage()

  if (!data[domain]) {
    return { success: false, message: 'Domain not found' }
  }

  delete data[domain]
  await writeStorage(data)
  return { success: true, message: `Domain ${domain} deleted successfully` }
})
