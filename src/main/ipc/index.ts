import { registerSettingsHandlers } from './settings'
import { registerTuleapHandlers } from './tuleap'

export function registerIpcHandlers(): void {
  registerSettingsHandlers()
  registerTuleapHandlers()
}
