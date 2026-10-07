import { listCertJobSummaries } from '../../utils/certJobSummaries'

export default defineEventHandler(async () => {
  const summaries = await listCertJobSummaries()
  return { summaries }
})
