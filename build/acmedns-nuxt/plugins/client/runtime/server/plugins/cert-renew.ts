import { startRenewScheduler } from '../utils/certRenewScheduler'

export default defineNitroPlugin(() => {
  startRenewScheduler()
})
