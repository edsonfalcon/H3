import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchIncidents } from '../../api/lumon'
import type { Incident } from '../../api/schemas'
import { ApiError } from '../../api/http'
import { useSession } from '../../auth/SessionContext'
import { useEvents } from '../../events/EventsProvider'

const SIZES = [10, 25, 50] as const

const COLORES_SEVERIDAD: Record<Incident['severity'], string> = {
  LOW: 'bg-slate-700 text-slate-200',
  MEDIUM: 'bg-amber-900/60 text-amber-200',
  HIGH: 'bg-orange-900/60 text-orange-200',
  CRITICAL: 'bg-red-900/60 text-red-200',
}

const NOMBRES_SEVERIDAD: Record<Incident['severity'], string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
}

function sanitizar(params: URLSearchParams) {
  const pageRaw = Number(params.get('page'))
  const sizeRaw = Number(params.get('size'))
  const size = (SIZES as readonly number[]).includes(sizeRaw) ? sizeRaw : 10
  const page = Number.isInteger(pageRaw) && pageRaw >= 0 ? pageRaw : 0
  return { page, size }
}

function formatearFecha(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
  } catch {
    return iso
  }
}

export default function IncidentsPage() {
  const [params, setParams] = useSearchParams()
  const state = useMemo(() => sanitizar(params), [params])
  const { can } = useSession()
  const { subscribe } = useEvents()
  const puedeCrear = can('incidents:create')

  const [data, setData] = useState<{ content: Incident[]; totalElements: number; totalPages: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refresco, setRefresco] = useState(0)
  const seqRef = useRef(0)

  useEffect(() => {
    const seq = ++seqRef.current
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetchIncidents(state.page, state.size, controller.signal)
      .then((page) => {
        if (seq !== seqRef.current) {
          return
        }
        setData(page)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || seq !== seqRef.current) {
          return
        }
        if (err instanceof ApiError) {
          setError(err.message)
        } else {
          setError('No se pudo cargar las incidencias.')
        }
        setLoading(false)
      })
    return () => {
      controller.abort()
    }
  }, [state.page, state.size, refresco])

  useEffect(() => {
    return subscribe((ev) => {
      if (ev.event === 'stream.reset') {
        setRefresco((n) => n + 1)
      }
    })
  }, [subscribe])

  const actualizar = (cambios: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(cambios)) {
      if (value === null || value === '') {
        next.delete(key)
      } else {
        next.set(key, value)
      }
    }
    setParams(next)
  }

  const totalPaginas = data?.totalPages ?? 1
  const paginaSegura = Math.min(state.page, Math.max(0, totalPaginas - 1))

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold text-emerald-100">Incidencias</h1>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="incidents-size" className="mb-1 block text-xs font-medium text-slate-300">
              Por página
            </label>
            <select
              id="incidents-size"
              value={String(state.size)}
              onChange={(e) => actualizar({ size: e.target.value, page: null })}
              className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
            >
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {puedeCrear && (
            <Link
              to="/incidents/new"
              className="rounded-md bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-slate-900 hover:bg-emerald-400"
            >
              Nueva incidencia
            </Link>
          )}
        </div>
      </div>

      {error !== null && (
        <div role="alert" className="mb-4 rounded-md border border-red-700/60 bg-red-900/30 px-4 py-3 text-sm text-red-200">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setRefresco((n) => n + 1)}
            className="mt-2 rounded-md border border-red-500 px-3 py-1 font-medium text-red-100 hover:bg-red-900/50"
          >
            Reintentar
          </button>
        </div>
      )}

      {loading && data === null && (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="h-44 animate-pulse rounded-lg border border-slate-700 bg-slate-800/60" />
          ))}
        </ul>
      )}

      {!loading && data !== null && data.content.length === 0 && error === null && (
        <p className="rounded-md border border-slate-700 bg-slate-800/40 px-4 py-6 text-center text-slate-300">
          No hay incidencias reportadas.
        </p>
      )}

      {data !== null && data.content.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {data.content.map((incident) => (
            <li key={incident.id} className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLORES_SEVERIDAD[incident.severity]}`}>
                  {NOMBRES_SEVERIDAD[incident.severity]}
                </span>
                <h2 className="min-w-0 flex-1 truncate font-semibold text-emerald-100">{incident.title}</h2>
                <span className="text-xs text-slate-500">#{incident.id}</span>
              </div>
              <p className="text-sm text-slate-300">{incident.description}</p>
              <p className="mt-1 text-xs text-slate-400">
                Reportada por {incident.createdBy.displayName} · {formatearFecha(incident.createdAt)}
                {incident.file !== null && (
                  <>
                    {' · '}
                    <Link to={`/files/${incident.file.id}/refine`} className="text-emerald-300 hover:underline">
                      {incident.file.name}
                    </Link>
                  </>
                )}
              </p>
              {incident.photos.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {incident.photos.map((photo) => (
                    <li key={photo.mediaId} className="h-20 w-28 overflow-hidden rounded-md border border-slate-600 bg-slate-900">
                      <img
                        src={photo.url}
                        alt={`Foto de la incidencia ${incident.id}`}
                        width={photo.width}
                        height={photo.height}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {data !== null && totalPaginas > 1 && (
        <nav aria-label="Paginación de incidencias" className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={paginaSegura === 0}
            onClick={() => actualizar({ page: String(paginaSegura - 1) })}
            className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-sm text-slate-300">
            Página {paginaSegura + 1} de {totalPaginas} · {data.totalElements} incidencias
          </span>
          <button
            type="button"
            disabled={paginaSegura >= totalPaginas - 1}
            onClick={() => actualizar({ page: String(paginaSegura + 1) })}
            className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-40"
          >
            Siguiente
          </button>
        </nav>
      )}
    </div>
  )
}
