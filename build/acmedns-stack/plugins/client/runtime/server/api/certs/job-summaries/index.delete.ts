import { clearCertJobSummaries } from '../../../utils/certJobSummaries'

export default defineEventHandler(async () => {
  const removed = await clearCertJobSummaries()
  return { removed }
})
