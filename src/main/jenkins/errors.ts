export type JenkinsErrorKind = 'auth' | 'network' | 'http' | 'schema' | 'unknown'

export class JenkinsError extends Error {
  override readonly name: string = 'JenkinsError'
  readonly kind: JenkinsErrorKind
  readonly status: number | undefined

  constructor(kind: JenkinsErrorKind, message: string, status?: number) {
    super(message)
    this.kind = kind
    this.status = status
  }
}

export class JenkinsAuthError extends JenkinsError {
  override readonly name = 'JenkinsAuthError'
  constructor(message = 'Authentification refusée par Jenkins (401).', status = 401) {
    super('auth', message, status)
  }
}

export class JenkinsNotFoundError extends JenkinsError {
  override readonly name = 'JenkinsNotFoundError'
  constructor(message = 'Ressource Jenkins introuvable (404).', status = 404) {
    super('http', message, status)
  }
}

export class JenkinsServerError extends JenkinsError {
  override readonly name = 'JenkinsServerError'
  constructor(message: string, status: number) {
    super('http', message, status)
  }
}

export class JenkinsNetworkError extends JenkinsError {
  override readonly name = 'JenkinsNetworkError'
  constructor(message: string) {
    super('network', message)
  }
}

export class JenkinsSchemaError extends JenkinsError {
  override readonly name = 'JenkinsSchemaError'
  constructor(message: string) {
    super('schema', message)
  }
}
