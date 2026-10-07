import { registerLabPlugin } from '../../../../client/runtime/server/utils/certJobQueue/labRegistry'
import { executeLabDns01 } from '../utils/labExecutor'
import { readLabDomainsFile } from '../utils/labDomainsFile'
import {
  completeLabJobTaskRequests,
  createLabJobTaskPlan,
  finishLabJobTask,
  startLabJobTask,
  trackLabJobTaskRequest,
} from '#lab-shared/utils/labJobTasks'

export default defineNitroPlugin(() => {
  registerLabPlugin({
    executor: executeLabDns01,
    readDomains: readLabDomainsFile,
    jobTasks: {
      createPlan: createLabJobTaskPlan,
      startTask: startLabJobTask,
      finishTask: finishLabJobTask,
      trackRequest: trackLabJobTaskRequest,
      completeRequests: completeLabJobTaskRequests,
    },
  })
})
