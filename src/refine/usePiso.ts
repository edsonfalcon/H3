import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { requestFloorTicket } from '../api/lumon'
import { ApiError } from '../api/http'

const WS_URL = import.meta.env.VITE_WS_BASE_URL
const PING_CADA = 15000
const CURSOR_MIN_MS = 100
const RENOVAR_CADA = 5000

export interface Presente {
  userId: number
  displayName: string
  r: number | null
  c: number | null
}

export interface Reserva {
  claimId: string
  userId: number
  displayName: string
  cells: Array<{ r: number; c: number }>
}

export type EstadoPiso = 'desconectado' | 'conectando' | 'conectado' | 'cerrado' | 'reconectando'

interface PisoApi {
  estado: EstadoPiso
  mensajeCierre: string | null
  presentes: Presente[]
  reservas: Reserva[]
  miReserva: Reserva | null
  enviarCursor: (r: number, c: number) => void
  pedirReserva: (r: number, c: number) => void
  cancelarReserva: () => void
}

interface MensajeServidor {
  type: string
  seq?: number
  userId?: number
  displayName?: string
  members?: Array<{ userId: number; displayName: string; r: number | null; c: number | null }>
  claims?: Reserva[]
  r?: number
  c?: number
  claimId?: string
  requestId?: string | number
  reason?: string
  holder?: { userId: number; displayName: string } | null
  cells?: Array<{ r: number; c: number }>
  expiresAt?: string
  t?: number
}

export function usePiso(fileId: number, miUserId: number | null, activo: boolean): PisoApi {
  const [estado, setEstado] = useState<EstadoPiso>('desconectado')
  const [mensajeCierre, setMensajeCierre] = useState<string | null>(null)
  const [presentes, setPresentes] = useState<Presente[]>([])
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [miReserva, setMiReserva] = useState<Reserva | null>(null)

  const enviarRef = useRef<(objeto: unknown) => void>(() => {})
  const miReservaRef = useRef<Reserva | null>(null)
  const ultimoCursorRef = useRef(0)
  const miReservaActual = useCallback((reserva: Reserva | null) => {
    miReservaRef.current = reserva
    setMiReserva(reserva)
  }, [])
  miReservaRef.current = miReserva

  useEffect(() => {
    if (!activo) {
      return
    }
    let parado = false
    let intentosRed = 0
    let reintentoTimer = 0
    let pingTimer = 0
    let renovarTimer = 0
    let ws: WebSocket | null = null
    let seqActual: number | null = null
    let pingsSinPong = 0

    const enviar = (objeto: unknown): void => {
      if (ws !== null && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(objeto))
      }
    }
    enviarRef.current = enviar

    const limpiarTimers = () => {
      if (pingTimer !== 0) {
        window.clearInterval(pingTimer)
        pingTimer = 0
      }
      if (renovarTimer !== 0) {
        window.clearInterval(renovarTimer)
        renovarTimer = 0
      }
    }

    const reconectar = (espera: number) => {
      if (parado) {
        return
      }
      setEstado('reconectando')
      reintentoTimer = window.setTimeout(conectar, espera)
    }

    const manejarMensaje = (texto: string) => {
      let mensaje: MensajeServidor
      try {
        mensaje = JSON.parse(texto) as MensajeServidor
      } catch {
        return
      }
      if (typeof mensaje.seq === 'number') {
        if (seqActual !== null && mensaje.seq > seqActual + 1) {
          enviar({ type: 'resync' })
        }
        seqActual = Math.max(seqActual ?? 0, mensaje.seq)
      }
      switch (mensaje.type) {
        case 'snapshot':
          setPresentes(mensaje.members ?? [])
          setReservas(mensaje.claims ?? [])
          if (miReservaRef.current !== null) {
            const mia = (mensaje.claims ?? []).find((claim) => claim.claimId === miReservaRef.current?.claimId)
            if (mia === undefined) {
              miReservaActual(null)
            }
          }
          break
        case 'member.joined': {
          const nuevo: Presente = {
            userId: mensaje.userId as number,
            displayName: mensaje.displayName ?? '',
            r: null,
            c: null,
          }
          setPresentes((actuales) =>
            actuales.some((p) => p.userId === nuevo.userId)
              ? actuales.map((p) => (p.userId === nuevo.userId ? { ...p, ...nuevo } : p))
              : [...actuales, nuevo],
          )
          break
        }
        case 'member.left': {
          const userId = mensaje.userId as number
          setPresentes((actuales) => actuales.filter((p) => p.userId !== userId))
          setReservas((actuales) => actuales.filter((claim) => claim.userId !== userId))
          if (miReservaRef.current !== null && miReservaRef.current.userId === userId) {
            miReservaActual(null)
          }
          break
        }
        case 'cursor': {
          const userId = mensaje.userId as number
          const r = mensaje.r as number
          const c = mensaje.c as number
          setPresentes((actuales) =>
            actuales.map((p) => (p.userId === userId ? { ...p, r, c } : p)),
          )
          break
        }
        case 'claim.granted':
        case 'claim.updated': {
          const reserva: Reserva = {
            claimId: mensaje.claimId as string,
            userId: mensaje.userId as number,
            displayName: mensaje.displayName ?? '',
            cells: mensaje.cells ?? [],
          }
          setReservas((actuales) => [...actuales.filter((claim) => claim.claimId !== reserva.claimId), reserva])
          if (mensaje.type === 'claim.granted' || reserva.userId === miUserId) {
            miReservaActual(reserva)
          }
          break
        }
        case 'claim.released': {
          const claimId = mensaje.claimId as string
          setReservas((actuales) => actuales.filter((claim) => claim.claimId !== claimId))
          if (miReservaRef.current?.claimId === claimId) {
            miReservaActual(null)
          }
          break
        }
        case 'pong':
          pingsSinPong = 0
          break
      }
    }

    const conectar = () => {
      if (parado) {
        return
      }
      setEstado('conectando')
      setMensajeCierre(null)
      requestFloorTicket(fileId)
        .then(({ ticket }) => {
          if (parado) {
            return
          }
          ws = new WebSocket(`${WS_URL}/floor/ws?ticket=${encodeURIComponent(ticket)}`)
          ws.onopen = () => {
            if (parado || ws === null) {
              return
            }
            intentosRed = 0
            setEstado('conectado')
            pingsSinPong = 0
            enviar({ type: 'ping', t: Date.now() })
            limpiarTimers()
            pingTimer = window.setInterval(() => {
              pingsSinPong += 1
              enviar({ type: 'ping', t: Date.now() })
              if (pingsSinPong >= 2) {
                ws?.close(4000, 'sin pong')
              }
            }, PING_CADA)
            renovarTimer = window.setInterval(() => {
              const claimId = miReservaRef.current?.claimId
              if (claimId !== undefined) {
                enviar({ type: 'renew', claimId })
              }
            }, RENOVAR_CADA)
          }
          ws.onmessage = (ev: MessageEvent) => {
            manejarMensaje(ev.data as string)
          }
          ws.onclose = (ev: CloseEvent) => {
            limpiarTimers()
            if (wsRefEsEste(ws)) {
              ws = null
            }
            if (parado) {
              return
            }
            if (ev.code === 4400 || ev.code === 4403 || ev.code === 4404 || ev.code === 4423) {
              setEstado('cerrado')
              setMensajeCierre(mensajeCierrePara(ev))
              return
            }
            if (ev.code === 4401 || ev.code === 4408) {
              reconectar(2000)
              return
            }
            if (ev.code === 4429) {
              reconectar(10000)
              return
            }
            const esperas = [1000, 2000, 4000, 8000, 16000, 30000]
            reconectar(esperas[Math.min(intentosRed, esperas.length - 1)])
            intentosRed += 1
          }
          ws.onerror = () => {}
        })
        .catch((err: unknown) => {
          if (parado) {
            return
          }
          if (err instanceof ApiError && (err.status === 423 || err.status === 404 || err.status === 403)) {
            setEstado('cerrado')
            setMensajeCierre(
              err.status === 423
                ? 'El Piso de Pruebas está cerrado: el piso compartido se activa al aprobar la revisión automática.'
                : err.message,
            )
            return
          }
          if (intentosRed >= 6) {
            setEstado('cerrado')
            setMensajeCierre('No se pudo conectar al piso compartido.')
            return
          }
          const esperas = [1000, 2000, 4000, 8000, 16000, 30000]
          reconectar(esperas[Math.min(intentosRed, esperas.length - 1)])
          intentosRed += 1
        })
    }

    const wsRefEsEste = (candidato: WebSocket | null): boolean => ws === candidato

    conectar()

    return () => {
      parado = true
      window.clearTimeout(reintentoTimer)
      limpiarTimers()
      if (ws !== null) {
        ws.onclose = null
        ws.onmessage = null
        ws.onerror = null
        ws.onopen = null
        try {
          const claimId = miReservaRef.current?.claimId
          if (claimId !== undefined && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'release', claimId }))
          }
        } catch {
          ws.close(1000, 'saliendo')
        }
        ws.close(1000, 'saliendo')
        ws = null
      }
    }
  }, [fileId, activo, miUserId, miReservaActual])

  const enviarCursor = useCallback((r: number, c: number) => {
    if (document.hidden) {
      return
    }
    const ahora = Date.now()
    if (ahora - ultimoCursorRef.current < CURSOR_MIN_MS) {
      return
    }
    ultimoCursorRef.current = ahora
    enviarRef.current({ type: 'cursor', r, c })
  }, [])

  const pedirReserva = useCallback((r: number, c: number) => {
    const requestId = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    enviarRef.current({ type: 'claim', requestId, r, c })
  }, [])

  const cancelarReserva = useCallback(() => {
    const claimId = miReservaRef.current?.claimId
    if (claimId !== undefined) {
      enviarRef.current({ type: 'release', claimId })
    }
  }, [])

  const api = useMemo<PisoApi>(
    () => ({ estado, mensajeCierre, presentes, reservas, miReserva, enviarCursor, pedirReserva, cancelarReserva }),
    [estado, mensajeCierre, presentes, reservas, miReserva, enviarCursor, pedirReserva, cancelarReserva],
  )

  return api
}

function mensajeCierrePara(ev: CloseEvent): string {
  if (ev.reason !== '') {
    return `El piso compartido se cerró: ${ev.reason}`
  }
  switch (ev.code) {
    case 4400:
      return 'El servidor rechazó un mensaje de esta pestaña (código 4400).'
    case 4403:
      return 'Este origen no puede conectarse al piso (código 4403).'
    case 4404:
      return 'El archivo ya no existe en el piso (código 4404).'
    case 4423:
      return 'El Piso de Pruebas está cerrado (código 4423).'
    default:
      return `El piso compartido se cerró (código ${ev.code}).`
  }
}
