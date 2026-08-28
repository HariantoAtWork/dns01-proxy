import { deleteCertJobSummary } from '../../../utils/certJobSummaries'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing summary id' })
  }

  const removed = await deleteCertJobSummary(id)
  if (!removed) {
    throw createError({ statusCode: 404, statusMessage: 'Summary not found' })
  }

  return { removed: true }
})
