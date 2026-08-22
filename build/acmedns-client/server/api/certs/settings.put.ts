import { assertDirectoryMode, writeCertSettings } from '../../utils/certSettings'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ directoryMode?: unknown }>(event)
  const directoryMode = assertDirectoryMode(body?.directoryMode)
  const settings = { directoryMode }
  await writeCertSettings(settings)
  return settings
})
