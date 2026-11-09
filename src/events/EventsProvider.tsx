import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { requestStreamTicket, ackContingency } from '../api/lumon'
import { useSession } from '../auth/SessionContext'
import { revokeLocalSession } from '../auth/tokens'
import { ApiError } from '../api/http'

const API_URL = import.meta.env.VITE_API_BASE_URL
const BACKOFFS = [1000, 2000, 4000, 8000, 16000, 30000]
const DEAD_MS = 45000
const TIPOS = [
  'refiner.updated',
  'refinement.created',
  'file.completed',
  'contingency.activated',
  'contingency.resolved',
  'session.revoked',
  'stream.reset',
  'stream.superseded',
]

export interface StreamEvent {
  id: number
  event: string
  data: unknown
}

type EstadoConexion = 'conectando' | 'conectado' | 'reconectando'

interface EventsContextValue {
  estado: EstadoConexion
  subscribe: (handler: (ev: StreamEvent) => void) => () => void
}

const EventsContext = createContext<EventsContextValue | null>(null)

const channel = new BroadcastChannel('lumon-events')

interface ContingenciaActiva {
  id: number
  message: string
}

export function EventsProvider({ children }: { children: ReactNode }) {
  const { me } = useSession()
  const [estado, setEstado] = useState<EstadoConexion>('conectando')
  const [contingencia, setContingencia] = useState<ContingenciaActiva | null>(null)
  const [ackError, setAckError] = useState<string | null>(null)
  const [ackLoading, setAckLoading] = useState(false)

  const handlersRef = useRef(new Set<(ev: StreamEvent) => void>())
  const seenIdsRef = useRef(new Set<number>())
  const lastEventIdRef = useRef<number | null>(null)
  const meRef = useRef(me)
  meRef.current = me

  const dispatch = useCallback((ev: StreamEvent) => {
    if (seenIdsRef.current.has(ev.id)) {
      return
    }
    seenIdsRef.current.add(ev.id)
    lastEventIdRef.current = ev.id
    for (const handler of handlersRef.current) {
      handler(ev)
    }
  }, [])

  const handleContingencia = useCallback((data: unknown) => {
    const payload = data as { id?: number; userId?: number; message?: string } | null
    if (payload === null || typeof payload.id !== 'number') {
      return
    }
    if (payload.userId !== meRef.current?.id) {
      return
    }
    setAckError(null)
    setContingencia({ id: payload.id, message: payload.message ?? 'Contingencia activada.' })
  }, [])

  const handleSessionRevoked = useCallback(() => {
    revokeLocalSession('SESSION_REVOKED')
  }, [])

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const message = ev.data as
        | { kind: 'event'; event: StreamEvent }
        | { kind: 'estado'; estado: EstadoConexion }
      if (message.kind === 'event') {
        if (message.event.event === 'contingency.activated') {
          handleContingencia(message.event.data)
        }
        if (message.event.event === 'session.revoked') {
          handleSessionRevoked()
        }
        if (message.event.event === 'contingency.resolved') {
          const resolved = message.event.data as { id?: number } | null
          if (resolved !== null && typeof resolved.id === 'number') {
            setContingencia((actual) => (actual?.id === resolved.id ? null : actual))
          }
        }
        dispatch(message.event)
      } else {
        setEstado(message.estado)
      }
    }
    channel.addEventListener('message', onMessage)
    return () => {
      channel.removeEventListener('message', onMessage)
    }
  }, [dispatch, handleContingencia, handleSessionRevoked])

  useEffect(() => {
    let es: EventSource | null = null
    let stopped = false
    let attempts = 0
    let reconnectTimer = 0
    let deadTimer = 0

    const setEstadoCompartido = (nuevo: EstadoConexion) => {
      setEstado(nuevo)
      channel.postMessage({ kind: 'estado', estado: nuevo })
    }

    const clearDeadTimer = () => {
      if (deadTimer !== 0) {
        window.clearTimeout(deadTimer)
      }
    }

    const armDeadTimer = () => {
      clearDeadTimer()
      deadTimer = window.setTimeout(() => {
        cerrar()
        programarReconexion(500)
      }, DEAD_MS)
    }

    const cerrar = () => {
      if (es !== null) {
        es.close()
        es = null
      }
      clearDeadTimer()
    }

    const programarReconexion = (delayOverride: number | null) => {
      const delay = delayOverride ?? BACKOFFS[Math.min(attempts, BACKOFFS.length - 1)]
      attempts += 1
      setEstadoCompartido('reconectando')
      reconnectTimer = window.setTimeout(conectar, delay)
    }

    const conectar = () => {
      if (stopped) {
        return
      }
      setEstadoCompartido('conectando')
      requestStreamTicket()
        .then((res) => {
          if (stopped) {
            return
          }
          const params = new URLSearchParams({ ticket: res.ticket })
          if (lastEventIdRef.current !== null) {
            params.set('lastEventId', String(lastEventIdRef.current))
          }
          const source = new EventSource(`${API_URL}/events/stream?${params.toString()}`)
          es = source
          source.onopen = () => {
            attempts = 0
            setEstadoCompartido('conectado')
            armDeadTimer()
          }
          source.onerror = () => {
            source.close()
            if (es === source) {
              es = null
            }
            if (!stopped) {
              programarReconexion(null)
            }
          }
          for (const tipo of TIPOS) {
            source.addEventListener(tipo, (ev: MessageEvent) => {
              armDeadTimer()
              let data: unknown = null
              try {
                data = JSON.parse(ev.data as string)
              } catch {
                data = null
              }
              if (tipo === 'stream.superseded') {
                source.close()
                if (es === source) {
                  es = null
                }
                if (!stopped) {
                  programarReconexion(null)
                }
                return
              }
              if (tipo === 'contingency.activated') {
                handleContingencia(data)
              }
              if (tipo === 'session.revoked') {
                handleSessionRevoked()
              }
              if (tipo === 'contingency.resolved') {
                const resolved = data as { id?: number } | null
                if (resolved !== null && typeof resolved.id === 'number') {
                  setContingencia((actual) => (actual?.id === resolved.id ? null : actual))
                }
              }
              const event: StreamEvent = { id: Number(ev.lastEventId), event: tipo, data }
              dispatch(event)
              channel.postMessage({ kind: 'event', event })
            })
          }
        })
        .catch((err: unknown) => {
          if (stopped) {
            return
          }
          if (err instanceof ApiError && (err.code === 'SESSION_REVOKED' || err.code === 'REFRESH_REUSED')) {
            handleSessionRevoked()
            return
          }
          programarReconexion(null)
        })
    }

    const mantenerLock = new Promise<void>(() => {})

    const intentarLiderar = () => {
      if (stopped) {
        return
      }
      if (typeof navigator.locks === 'undefined' || navigator.locks.request === undefined) {
        conectar()
        return
      }
      navigator.locks
        .request('lumon-sse', { ifAvailable: true }, (lock) => {
          if (lock === null) {
            if (!stopped) {
              reconnectTimer = window.setTimeout(intentarLiderar, 3000)
            }
            return null
          }
          conectar()
          return mantenerLock
        })
        .catch(() => {
          if (!stopped) {
            reconnectTimer = window.setTimeout(intentarLiderar, 3000)
          }
        })
    }

    intentarLiderar()

    return () => {
      stopped = true
      window.clearTimeout(reconnectTimer)
      clearDeadTimer()
      cerrar()
    }
  }, [dispatch, handleContingencia, handleSessionRevoked])

  const confirmarContingencia = async () => {
    if (contingencia === null) {
      return
    }
    setAckLoading(true)
    setAckError(null)
    try {
      await ackContingency(contingencia.id)
      setContingencia(null)
    } catch (err) {
      if (err instanceof ApiError) {
        setAckError(err.message)
      } else {
        setAckError('No se pudo confirmar la contingencia.')
      }
    } finally {
      setAckLoading(false)
    }
  }

  const subscribe = useCallback((handler: (ev: StreamEvent) => void) => {
    handlersRef.current.add(handler)
    return () => {
      handlersRef.current.delete(handler)
    }
  }, [])

  const value = useMemo<EventsContextValue>(() => ({ estado, subscribe }), [estado, subscribe])

  return (
    <EventsContext.Provider value={value}>
      <p aria-live="assertive" className="sr-only">
        {contingencia !== null ? 'Contingencia activada: se requiere tu confirmación.' : ''}
      </p>
      {children}
      {contingencia !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="contingencia-titulo"
            onKeyDown={(e) => {
              if (e.key !== 'Tab') {
                return
              }
              e.preventDefault()
              const dialog = e.currentTarget
              const enfocables = dialog.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
              )
              if (enfocables.length === 0) {
                return
              }
              const actual = Array.prototype.indexOf.call(enfocables, document.activeElement)
              const siguiente = e.shiftKey
                ? (actual <= 0 ? enfocables.length - 1 : actual - 1)
                : (actual === enfocables.length - 1 ? 0 : actual + 1)
              enfocables[siguiente].focus()
            }}
            className="w-full max-w-md rounded-xl border border-amber-500/60 bg-slate-900 p-6 shadow-2xl"
          >
            <h2 id="contingencia-titulo" className="mb-2 text-xl font-semibold text-amber-200">
              Contingencia activada
            </h2>
            <p className="mb-4 text-slate-200">{contingencia.message}</p>
            {ackError !== null && (
              <p
                role="alert"
                className="mb-4 rounded-md border border-red-700/60 bg-red-900/30 px-3 py-2 text-sm text-red-200"
              >
                {ackError}
              </p>
            )}
            <button
              type="button"
              autoFocus
              onClick={confirmarContingencia}
              disabled={ackLoading}
              className="w-full rounded-md bg-amber-400 px-4 py-2 font-semibold text-slate-900 hover:bg-amber-300 disabled:opacity-60"
            >
              {ackLoading ? 'Confirmando…' : 'Confirmar horas extra'}
            </button>
          </div>
        </div>
      )}
    </EventsContext.Provider>
  )
}

export function useEvents(): EventsContextValue {
  const ctx = useContext(EventsContext)
  if (ctx === null) {
    throw new Error('useEvents debe usarse dentro de EventsProvider')
  }
  return ctx
}
