/**
 * Wrapper typé pour `window.api` exposé par le preload.
 * Évite que chaque composant doive caster window.api.
 */
import type { AppApi } from '../../../preload'

export const api: AppApi = window.api as AppApi
export type { AppApi }
