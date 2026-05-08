import { registerSettingsHandlers } from './settings'
import { registerTuleapHandlers } from './tuleap'
import { registerGenerationHandlers } from './generation'
import { registerMarpHandlers } from './marp'
import { registerChatHandlers } from './chat'
import { registerAuthHandlers } from './auth'

export function registerIpcHandlers(): void {
  registerSettingsHandlers()
  registerTuleapHandlers()
  registerGenerationHandlers()
  registerMarpHandlers()
  registerChatHandlers()
  registerAuthHandlers()
}
