import type { CertApplyResult, CertJobTask, DomainsParseResult } from '#shared/types/certs'
import type { AcmeOrderToken } from '../../../shared/utils/acmeIssueSteps'

export interface LabExecutorOptions {
  certNames?: string[]
  force?: boolean
  jobId: number
  priorResults?: CertApplyResult[]
  abortSignal: AbortSignal
  onProgress: (progress: { certName: string | undefined, taskIndex: number, taskTotal: number }) => void
  shouldCancel: () => boolean
}

export type LabJobExecutor = (
  options: LabExecutorOptions,
) => Promise<{ results: CertApplyResult[], cancelled: boolean }>

export interface LabJobTaskHooks {
  createPlan: (certNames: string[], completed?: Set<string>) => CertJobTask[]
  startTask: (tasks: CertJobTask[], certName: string) => CertJobTask[]
  finishTask: (
    tasks: CertJobTask[],
    certName: string,
    status: CertJobTask['status'],
    message?: string,
  ) => CertJobTask[]
  trackRequest: (
    tasks: CertJobTask[],
    certName: string,
    stepIndex: number,
    stepLabel?: string,
    seedAltNames?: string[],
    orderTokens?: AcmeOrderToken[],
  ) => CertJobTask[]
  completeRequests: (tasks: CertJobTask[], certName: string) => CertJobTask[]
}

export interface LabPluginRegistration {
  executor: LabJobExecutor
  readDomains: () => Promise<DomainsParseResult>
  jobTasks: LabJobTaskHooks
}

let registration: LabPluginRegistration | null = null

export function registerLabPlugin(hooks: LabPluginRegistration) {
  registration = hooks
}

export function getLabPlugin(): LabPluginRegistration | null {
  return registration
}

export function requireLabPlugin(): LabPluginRegistration {
  if (!registration) {
    throw createError({
      statusCode: 503,
      statusMessage: 'DNS-01 lab plugin is not loaded',
    })
  }
  return registration
}
