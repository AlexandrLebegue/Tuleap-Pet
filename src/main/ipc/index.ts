import { registerSettingsHandlers } from './settings'
import { registerTuleapHandlers } from './tuleap'
import { registerGenerationHandlers } from './generation'
import { registerMarpHandlers } from './marp'
import { registerChatHandlers } from './chat'
import { registerAuthHandlers } from './auth'
import { registerCoderHandlers } from './coder'
import { registerAdminHandlers } from './admin'

export function registerIpcHandlers(): void {
  registerSettingsHandlers()
  registerTuleapHandlers()
  registerGenerationHandlers()
  registerMarpHandlers()
  registerChatHandlers()
  registerAuthHandlers()
  registerCoderHandlers()
  registerAdminHandlers()
}
