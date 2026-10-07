import { listAccessDenies } from '../../utils/accessDenies'

export default defineEventHandler(() => {
  return { denies: listAccessDenies() }
})
