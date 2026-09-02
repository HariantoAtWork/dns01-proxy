import type { LabRequestStepProgress } from '#lab-shared/utils/labIssueSteps'
import { canonicalSans } from '#shared/utils/domains'
import { getSharedModeContext } from '../../../../../server/utils/sharedModeBootstrap'
import { readStorage } from '../../../../client/runtime/server/utils/storage'
import {
  clearDns01ChallengeTxt,
  createChallengeSerialGate,
  resolveAcmeDnsBase,
  runDns01Challenge,
  throwIfAborted,
} from '../../../../client/runtime/server/utils/dns01Challenge'
import {
  LAB_REQUEST_STEPS,
  LAB_REQUEST_STEP_TOTAL,
  labRequestStepLabel,
} from '#lab-shared/utils/labIssueSteps'
import { fakeAcmeOrder, formatFakeAcmeOrderDetail } from './fakeAcmeOrder'

export async function runLabDns01(options: {
  certName: string
  altNames: string[]
  signal?: AbortSignal
  onRequestStep?: (step: LabRequestStepProgress) => void
}) {
  throwIfAborted(options.signal, 'Lab DNS-01 aborted')

  const reportStep = (index: number, label?: string) => {
    options.onRequestStep?.({
      index,
      total: LAB_REQUEST_STEP_TOTAL,
      label: label ?? labRequestStepLabel(index),
    })
  }

  const preferUrl = resolveAcmeDnsBase()
  const storage = await readStorage()
  const shared = getSharedModeContext()
  const sans = canonicalSans(options.altNames)

  reportStep(LAB_REQUEST_STEPS.ACME_ORDER, 'FAKE ACME order')

  const { challenges } = await fakeAcmeOrder(sans)
  const challengeSerial = createChallengeSerialGate()

  for (const challenge of challenges) {
    throwIfAborted(options.signal, 'Lab DNS-01 aborted')
    const turn = await challengeSerial.enter()
    let publishTarget: Awaited<ReturnType<typeof runDns01Challenge>> | undefined
    try {
      publishTarget = await runDns01Challenge({
        authzIdentifier: challenge.domain,
        keyAuthorization: challenge.keyAuthorization,
        certName: options.certName,
        preferUrl,
        shared,
        storage,
        signal: options.signal,
        reportStep,
        activitySource: 'lab',
        validateStepLabel: domain => `FAKE LE validate ${domain}`,
        validateReadyLog: domain =>
          `dns-01 TXT ready for ${domain}; FAKE LE validate (no Let's Encrypt call)`,
      })
      turn.markCreateFinished()
    }
    catch (error) {
      turn.abort()
      throw error
    }
    finally {
      if (publishTarget) {
        await clearDns01ChallengeTxt(publishTarget, 'lab')
      }
      turn.markRemove()
    }
  }

  return {
    certName: options.certName,
    challengeCount: challenges.length,
    orderDetail: formatFakeAcmeOrderDetail(challenges),
  }
}
