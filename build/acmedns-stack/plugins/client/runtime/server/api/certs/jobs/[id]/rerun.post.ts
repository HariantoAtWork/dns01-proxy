import { rerunCertJob } from '../../../../utils/certJobQueue'

export default defineEventHandler((event) => {
  const id = Number.parseInt(getRouterParam(event, 'id') || '', 10)
  if (!Number.isFinite(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid job id' })
  }
  return rerunCertJob(id)
})
