import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Me, Permission } from '../api/schemas'
import * as authApi from '../api/auth'
import {
  clearTokens,
  hasRefreshToken,
  logoutRemote,
  publishLogout,
  rotateTokens,
  subscribeSession,
} from './tokens'
import { NoSessionError } from './tokens'

type SessionStatus = 'checking' | 'anon' | 'ready'

interface SessionContextValue {
  me: Me | null
  status: SessionStatus
  sessionMessage: string | null
  login: (email: string, password: string) => Promise<void>
  register: (teamName: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  can: (permission: Permission) => boolean
}

const SessionContext = createContext<SessionContextValue | null>(null)

const REVOKED_MESSAGES: Record<string, string> = {
  REFRESH_REUSED: 'La sesión se revocó porque el refresh token se usó dos veces. Vuelve a iniciar sesión.',
  SESSION_REVOKED: 'La sesión se revocó desde el servidor. Vuelve a iniciar sesión.',
  LOGOUT: 'Cerraste sesión en otra pestaña.',
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [status, setStatus] = useState<SessionStatus>('checking')
  const [sessionMessage, setSessionMessage] = useState<string | null>(null)

  const toAnon = useCallback((message: string | null) => {
    setMe(null)
    setStatus('anon')
    setSessionMessage(message)
  }, [])

  useEffect(() => {
    let cancelled = false
    const unsubscribe = subscribeSession((event) => {
      if (event.type === 'logout') {
        toAnon('Cerraste sesión en otra pestaña.')
        return
      }
      if (event.type === 'revoked') {
        toAnon(REVOKED_MESSAGES[event.reason] ?? REVOCATION_FALLBACK)
      }
    })
    if (!hasRefreshToken()) {
      setStatus('anon')
      return unsubscribe
    }
    rotateTokens()
      .then(() => authApi.fetchMe())
      .then((user) => {
        if (!cancelled) {
          setMe(user)
          setStatus('ready')
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof NoSessionError) {
          clearTokens()
          setStatus('anon')
          return
        }
        toAnon('No se pudo restaurar la sesión. Vuelve a iniciar sesión.')
      })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [toAnon])

  const login = useCallback(
    async (email: string, password: string) => {
      await authApi.login(email, password)
      const user = await authApi.fetchMe()
      setMe(user)
      setStatus('ready')
      setSessionMessage(null)
    },
    [],
  )

  const register = useCallback(async (teamName: string, email: string, password: string) => {
    await authApi.register(teamName, email, password)
    const user = await authApi.fetchMe()
    setMe(user)
    setStatus('ready')
    setSessionMessage(null)
  }, [])

  const logout = useCallback(async () => {
    await logoutRemote()
    clearTokens()
    publishLogout()
    toAnon('Se cerró la sesión.')
  }, [toAnon])

  const can = useCallback(
    (permission: Permission) => me?.permissions.includes(permission) ?? false,
    [me],
  )

  const value = useMemo<SessionContextValue>(
    () => ({ me, status, sessionMessage, login, register, logout, can }),
    [me, status, sessionMessage, login, register, logout, can],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

const REVOCATION_FALLBACK = 'Tu sesión ya no es válida. Vuelve a iniciar sesión.'

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (ctx === null) {
    throw new Error('useSession debe usarse dentro de SessionProvider')
  }
  return ctx
}
