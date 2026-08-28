import { initCertJobSummaries } from '../utils/certJobSummaries'

export default defineNitroPlugin(async () => {
  await initCertJobSummaries()
})
