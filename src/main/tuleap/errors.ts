export type ErrorKind = 'auth' | 'network' | 'http' | 'schema' | 'unknown'

export class TuleapError extends Error {
  override readonly name: string = 'TuleapError'
  readonly kind: ErrorKind
  readonly status: number | undefined

  constructor(kind: ErrorKind, message: string, status?: number) {
    super(message)
    this.kind = kind
    this.status = status
  }
}

export class TuleapAuthError extends TuleapError {
  override readonly name = 'TuleapAuthError'
  constructor(message = 'Authentification refusée par Tuleap (401).', status = 401) {
    super('auth', message, status)
  }
}

export class TuleapNotFoundError extends TuleapError {
  override readonly name = 'TuleapNotFoundError'
  constructor(message = 'Ressource Tuleap introuvable (404).', status = 404) {
    super('http', message, status)
  }
}

export class TuleapServerError extends TuleapError {
  override readonly name = 'TuleapServerError'
  constructor(message: string, status: number) {
    super('http', message, status)
  }
}

export class TuleapNetworkError extends TuleapError {
  override readonly name = 'TuleapNetworkError'
  constructor(message: string) {
    super('network', message)
  }
}

export class TuleapSchemaError extends TuleapError {
  override readonly name = 'TuleapSchemaError'
  constructor(message: string) {
    super('schema', message)
  }
}
