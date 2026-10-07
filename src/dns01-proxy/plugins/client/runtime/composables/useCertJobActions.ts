import type { Ref } from 'vue'

export type JobQueueAction = 'cancel' | 'resume' | 'rerun' | 'delete'

export function useCertJobActions(deps: {
  jobActionPending: Ref<boolean>
  cancelJob: (id: number) => Promise<unknown>
  resumeJob: (id: number) => Promise<unknown>
  rerunJob: (id: number) => Promise<unknown>
  deleteJob: (id: number) => Promise<unknown>
  afterAction?: () => Promise<unknown> | unknown
}) {
  const toasts = useToasts()
  const {
    jobActionPending,
    cancelJob,
    resumeJob,
    rerunJob,
    deleteJob,
    afterAction,
  } = deps

  async function onJobAction(action: JobQueueAction, id: number) {
    jobActionPending.value = true
    try {
      if (action === 'cancel') {
        await cancelJob(id)
        toasts.info(`Job #${id} cancelled`, 'Queue')
      }
      else if (action === 'resume') {
        await resumeJob(id)
        toasts.ok(`Job #${id} resumed`, 'Queue')
      }
      else if (action === 'rerun') {
        await rerunJob(id)
        toasts.ok(`Job #${id} re-queued from start`, 'Queue')
      }
      else {
        await deleteJob(id)
        toasts.info(`Job #${id} deleted`, 'Queue')
      }
      await afterAction?.()
    }
    catch (caught) {
      const errors: Record<JobQueueAction, string> = {
        cancel: 'Cancel failed',
        resume: 'Resume failed',
        rerun: 'Re-run failed',
        delete: 'Delete failed',
      }
      toasts.error(caught instanceof Error ? caught.message : errors[action])
    }
    finally {
      jobActionPending.value = false
    }
  }

  return { onJobAction }
}
