export { JenkinsClient } from './client'
export {
  JenkinsError,
  JenkinsAuthError,
  JenkinsNetworkError,
  JenkinsNotFoundError,
  JenkinsSchemaError,
  JenkinsServerError
} from './errors'

import { JenkinsClient } from './client'
import { JenkinsError } from './errors'
import { getJenkinsUrl, getJenkinsUser } from '../store/config'
import { getJenkinsToken } from '../store/secrets'

export function buildJenkinsClient(): JenkinsClient {
  const url = getJenkinsUrl()
  const user = getJenkinsUser()
  const token = getJenkinsToken()
  if (!url) throw new JenkinsError('unknown', "L'URL Jenkins n'est pas configurée.")
  if (!user || !token) {
    throw new JenkinsError('auth', 'Identifiants Jenkins manquants. Configurez username et token.')
  }
  return new JenkinsClient({ baseUrl: url, username: user, apiToken: token })
}
