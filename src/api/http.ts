import type { ZodType } from 'zod'
import { NoSessionError, rotateTokens, clearTokens } from '../auth/tokens'
import { ErrorSchema } from './schemas'

const API_URL = import.meta.env.VITE_API_BASE_URL

export class ApiError extends Error {
  status: number
  code: string
  details: unknown
  retryAfter: number | null

  constructor(status: number, code: string, message: string, details: unknown = null, retryAfter: number | null = null) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
    this.retryAfter = retryAfter
  }
}

export interface RequestOptions {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  auth?: boolean
  retries?: number
}

export interface ResponseMeta {
  etag: string | null
  headers: Headers
}

function buildHeaders(opts: RequestOptions, token: string | null): Headers {
  const headers = new Headers({
    'X-Lumon-Build': __BUILD_SHA__,
  })
  if (opts.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }
  if (token !== null) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  for (const [key, value] of Object.entries(opts.headers ?? {})) {
    headers.set(key, value)
  }
  return headers
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal !== undefined && signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function parseError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => null)
  const parsed = ErrorSchema.safeParse(body)
  if (!parsed.success) {
    return new ApiError(res.status, 'UNKNOWN', `Error ${res.status} del servidor.`)
  }
  const retryAfterHeader = res.headers.get('Retry-After')
  const retryAfter = retryAfterHeader !== null ? Number(retryAfterHeader) : null
  return new ApiError(
    res.status,
    parsed.data.error,
    parsed.data.message,
    parsed.data.details,
    Number.isNaN(retryAfter) ? null : retryAfter,
  )
}

async function fetchOnce(path: string, opts: RequestOptions, token: string | null): Promise<Response> {
  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers: buildHeaders(opts, token),
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: opts.signal,
  })
  return res
}

async function run<T>(
  path: string,
  parse: (res: Response) => Promise<T>,
  opts: RequestOptions,
): Promise<T> {
  const needsAuth = opts.auth !== false
  const retries = opts.retries ?? 2

  let token: string | null = null
  if (needsAuth) {
    token = await rotateTokens()
  }

  let refreshed = false
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetchOnce(path, opts, token)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err
      }
      if (attempt >= retries) {
        throw new ApiError(0, 'NETWORK', 'No se pudo conectar con Lumon.')
      }
      await sleep(Math.min(600 * 2 ** attempt, 8000), opts.signal)
      continue
    }

    if (res.status === 401) {
      const err = await parseError(res)
      if (err.code === 'TOKEN_EXPIRED' && needsAuth && !refreshed) {
        refreshed = true
        token = await rotateTokens(true)
        continue
      }
      if (err.code === 'SESSION_REVOKED' || err.code === 'REFRESH_REUSED') {
        clearTokens()
      }
      throw err
    }

    if ((res.status === 429 || res.status === 503) && attempt < retries) {
      const retryAfter = res.headers.get('Retry-After')
      const wait = retryAfter !== null ? Number(retryAfter) * 1000 : 0
      const backoff = Math.min(600 * 2 ** attempt, 8000)
      await sleep(Math.max(wait, backoff), opts.signal)
      continue
    }

    if (!res.ok) {
      throw await parseError(res)
    }

    return await parse(res)
  }
}

export async function request<T>(path: string, schema: ZodType<T>, opts: RequestOptions = {}): Promise<T> {
  return run(path, async (res) => {
    if (res.status === 204) {
      return undefined as T
    }
    const json = await res.json().catch(() => null)
    const parsed = schema.safeParse(json)
    if (!parsed.success) {
      throw new ApiError(res.status, 'INVALID_RESPONSE', 'La respuesta del servidor no tiene el formato esperado.')
    }
    return parsed.data
  }, opts)
}

export async function requestWithMeta<T>(
  path: string,
  schema: ZodType<T>,
  opts: RequestOptions = {},
): Promise<{ data: T; meta: ResponseMeta }> {
  return run(path, async (res) => {
    const json = await res.json().catch(() => null)
    const parsed = schema.safeParse(json)
    if (!parsed.success) {
      throw new ApiError(res.status, 'INVALID_RESPONSE', 'La respuesta del servidor no tiene el formato esperado.')
    }
    return { data: parsed.data, meta: { etag: res.headers.get('ETag'), headers: res.headers } }
  }, opts)
}

export { NoSessionError }
