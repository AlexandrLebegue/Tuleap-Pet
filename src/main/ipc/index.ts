import { registerSettingsHandlers } from './settings'
import { registerTuleapHandlers } from './tuleap'
import { registerGenerationHandlers } from './generation'
import { registerMarpHandlers } from './marp'
import { registerChatHandlers } from './chat'
import { registerAuthHandlers } from './auth'
import { registerCoderHandlers } from './coder'
import { registerAdminHandlers } from './admin'
import { registerCommenterHandlers } from './commenter'
import { registerCommenterPRHandlers } from './commenter-pr'
import { registerCorrectorHandlers } from './corrector'
import { registerTestGeneratorHandlers } from './test-generator'
import { registerGitExplorerHandlers } from './git-explorer'
import { registerSvnExplorerHandlers } from './svn-explorer'
import { registerProjectRootHandlers } from './project-root'
import { registerTuleapWriteHandlers } from './tuleap-write'
import { registerSprintBoardHandlers } from './sprint-board'
import { registerTicketBranchHandlers } from './ticket-branch'
import { registerPrReviewerHandlers } from './pr-reviewer'
import { registerRagHandlers } from './rag'
import { registerReleaseNotesHandlers } from './release-notes'
import { registerSprintPlanningHandlers } from './sprint-planning'
import { registerBugReproHandlers } from './bug-repro'
import { registerTraceabilityHandlers } from './traceability'
import { registerJenkinsHandlers } from './jenkins'
import { registerJenkinsTtmHandlers } from './jenkins-ttm'

export function registerIpcHandlers(): void {
  registerSettingsHandlers()
  registerTuleapHandlers()
  registerGenerationHandlers()
  registerMarpHandlers()
  registerChatHandlers()
  registerAuthHandlers()
  registerCoderHandlers()
  registerAdminHandlers()
  registerCommenterHandlers()
  registerCommenterPRHandlers()
  registerCorrectorHandlers()
  registerTestGeneratorHandlers()
  registerGitExplorerHandlers()
  registerSvnExplorerHandlers()
  registerProjectRootHandlers()
  registerTuleapWriteHandlers()
  registerSprintBoardHandlers()
  registerTicketBranchHandlers()
  registerPrReviewerHandlers()
  registerRagHandlers()
  registerReleaseNotesHandlers()
  registerSprintPlanningHandlers()
  registerBugReproHandlers()
  registerTraceabilityHandlers()
  registerJenkinsHandlers()
  registerJenkinsTtmHandlers()
}
