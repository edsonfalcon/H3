import { TokenPairSchema } from '../api/schemas'

const REFRESH_KEY = 'lumon.refresh'
const API_URL = import.meta.env.VITE_API_BASE_URL
const BUILD = __BUILD_SHA__

let accessToken: string | null = null
let expiresAt = 0
let rotating: Promise<string> | null = null

export type SessionEvent =
  | { type: 'logout' }
  | { type: 'revoked'; reason: string }
  | { type: 'rotated' }

export class NoSessionError extends Error {
  constructor() {
    super('No hay sesión activa.')
  }
}

const channel = new BroadcastChannel('lumon-session')

export function subscribeSession(handler: (event: SessionEvent) => void): () => void {
  const listener = (ev: MessageEvent) => handler(ev.data as SessionEvent)
  channel.addEventListener('message', listener)
  return () => channel.removeEventListener('message', listener)
}

function publish(event: SessionEvent): void {
  channel.postMessage(event)
}

export function setTokens(pair: { accessToken: string; refreshToken: string; expiresIn: number }): void {
  accessToken = pair.accessToken
  expiresAt = Date.now() + pair.expiresIn * 1000
  localStorage.setItem(REFRESH_KEY, pair.refreshToken)
}

export function currentAccessToken(): string | null {
  return accessToken
}

export function hasRefreshToken(): boolean {
  return localStorage.getItem(REFRESH_KEY) !== null
}

export function clearTokens(): void {
  accessToken = null
  expiresAt = 0
  localStorage.removeItem(REFRESH_KEY)
}

function valid(): boolean {
  return accessToken !== null && Date.now() < expiresAt - 5000
}

async function callRefresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Lumon-Build': BUILD,
    },
    body: JSON.stringify({ refreshToken }),
  })
  if (res.status === 401) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    const code = body?.error ?? 'SESSION_REVOKED'
    clearTokens()
    publish({ type: 'revoked', reason: code })
    throw new NoSessionError()
  }
  if (!res.ok) {
    throw new Error('No se pudo renovar la sesión.')
  }
  const pair = TokenPairSchema.parse(await res.json())
  setTokens(pair)
  publish({ type: 'rotated' })
  return pair
}

async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks !== undefined && navigator.locks.request !== undefined) {
    return navigator.locks.request(name, fn)
  }
  return fn()
}

export async function rotateTokens(force = false): Promise<string> {
  if (!force && valid()) {
    return accessToken as string
  }
  if (rotating !== null) {
    return rotating
  }
  rotating = withLock('lumon-refresh', async () => {
    if (!force && valid()) {
      return accessToken as string
    }
    const refreshToken = localStorage.getItem(REFRESH_KEY)
    if (refreshToken === null) {
      throw new NoSessionError()
    }
    return (await callRefresh(refreshToken)).accessToken
  }).finally(() => {
    rotating = null
  })
  return rotating
}

export async function logoutRemote(): Promise<void> {
  const refreshToken = localStorage.getItem(REFRESH_KEY)
  if (refreshToken === null) {
    return
  }
  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Lumon-Build': BUILD,
      },
      body: JSON.stringify({ refreshToken }),
    })
  } catch {
    return
  }
}

export function publishLogout(): void {
  publish({ type: 'logout' })
}

export function revokeLocalSession(reason: string): void {
  clearTokens()
  publish({ type: 'revoked', reason })
}
