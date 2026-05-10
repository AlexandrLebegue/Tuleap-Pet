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
}
