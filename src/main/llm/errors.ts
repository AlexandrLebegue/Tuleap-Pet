export type LlmErrorKind = 'auth' | 'network' | 'rate-limit' | 'http' | 'unknown'

export class LlmError extends Error {
  override readonly name: string = 'LlmError'
  readonly kind: LlmErrorKind
  readonly status: number | undefined
  readonly model: string | undefined

  constructor(kind: LlmErrorKind, message: string, opts: { status?: number; model?: string } = {}) {
    super(message)
    this.kind = kind
    this.status = opts.status
    this.model = opts.model
  }
}

export class LlmAuthError extends LlmError {
  override readonly name = 'LlmAuthError'
  constructor(message = 'Clé OpenRouter refusée.', opts: { status?: number; model?: string } = {}) {
    super('auth', message, { status: opts.status ?? 401, ...opts })
  }
}

export class LlmRateLimitError extends LlmError {
  override readonly name = 'LlmRateLimitError'
  constructor(message: string, opts: { status?: number; model?: string } = {}) {
    super('rate-limit', message, { status: opts.status ?? 429, ...opts })
  }
}

export class LlmNetworkError extends LlmError {
  override readonly name = 'LlmNetworkError'
  constructor(message: string, opts: { model?: string } = {}) {
    super('network', message, opts)
  }
}

/** Convert an arbitrary thrown value (likely from the AI SDK) into an LlmError. */
export function toLlmError(err: unknown, model?: string): LlmError {
  if (err instanceof LlmError) return err
  const e = err as { name?: string; message?: string; statusCode?: number; status?: number }
  const status = e?.statusCode ?? e?.status
  const message = e?.message ?? String(err)
  if (status === 401 || status === 403) {
    return new LlmAuthError(message, { status, model })
  }
  if (status === 429) {
    return new LlmRateLimitError(message, { status, model })
  }
  if (typeof status === 'number' && status >= 400) {
    return new LlmError('http', message, { status, model })
  }
  if (e?.name === 'AbortError' || /network|fetch failed|ETIMEDOUT|ENOTFOUND/i.test(message)) {
    return new LlmNetworkError(message, { model })
  }
  return new LlmError('unknown', message, { model })
}
