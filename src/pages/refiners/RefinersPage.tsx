import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchRefiners } from '../../api/lumon'
import { fetchDepartments } from '../../api/lumon'
import type { Department, RefinerPage } from '../../api/schemas'
import type { Refiner } from '../../api/schemas'
import { ApiError } from '../../api/http'
import { useSession } from '../../auth/SessionContext'
import { useEvents } from '../../events/EventsProvider'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'

const SIZES = [10, 25, 50] as const

function sanitizar(params: URLSearchParams) {
  const pageRaw = Number(params.get('page'))
  const sizeRaw = Number(params.get('size'))
  const deptRaw = Number(params.get('departmentId'))
  const qRaw = params.get('q') ?? ''

  const size = (SIZES as readonly number[]).includes(sizeRaw) ? sizeRaw : 10
  const page = Number.isInteger(pageRaw) && pageRaw >= 0 ? pageRaw : 0
  const departmentId = Number.isInteger(deptRaw) && deptRaw >= 1 ? deptRaw : null
  const q = qRaw.slice(0, 60)

  return { page, size, departmentId, q }
}

function esHttp(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}

export default function RefinersPage() {
  const [params, setParams] = useSearchParams()
  const state = useMemo(() => sanitizar(params), [params])
  const { can } = useSession()
  const { subscribe } = useEvents()
  const puedeEscribir = can('refiners:write')

  const [texto, setTexto] = useState(state.q)
  const textoDebounced = useDebouncedValue(texto, 400)
  const [departamentos, setDepartamentos] = useState<Department[]>([])
  const [data, setData] = useState<RefinerPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refresco, setRefresco] = useState(0)
  const seqRef = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchDepartments(controller.signal)
      .then(setDepartamentos)
      .catch(() => {})
    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    if (textoDebounced !== state.q) {
      const next = new URLSearchParams(params)
      if (textoDebounced === '') {
        next.delete('q')
      } else {
        next.set('q', textoDebounced)
      }
      next.delete('page')
      setParams(next, { replace: true })
    }
  }, [textoDebounced, state.q, params, setParams])

  useEffect(() => {
    const seq = ++seqRef.current
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetchRefiners(
      { page: state.page, size: state.size, departmentId: state.departmentId, q: state.q === '' ? null : state.q },
      controller.signal,
    )
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
          setError('No se pudo cargar el directorio.')
        }
        setLoading(false)
      })
    return () => {
      controller.abort()
    }
  }, [state.page, state.size, state.departmentId, state.q, refresco])

  useEffect(() => {
    return subscribe((ev) => {
      if (ev.event === 'stream.reset') {
        setRefresco((n) => n + 1)
        return
      }
      if (ev.event !== 'refiner.updated') {
        return
      }
      const payload = ev.data as { id?: number; version?: number; refiner?: Refiner } | null
      if (payload === null || typeof payload.id !== 'number' || payload.refiner === undefined) {
        return
      }
      const refinerNuevo = payload.refiner
      const versionNueva = payload.version ?? refinerNuevo.version
      setData((actual) => {
        if (actual === null) {
          return actual
        }
        let cambio = false
        const content = actual.content.map((refiner) => {
          if (refiner.id === payload.id && versionNueva > refiner.version) {
            cambio = true
            return refinerNuevo
          }
          return refiner
        })
        if (!cambio) {
          return actual
        }
        return { ...actual, content }
      })
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
        <h1 className="text-2xl font-semibold text-emerald-100">Directorio del personal</h1>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="refiners-q" className="mb-1 block text-xs font-medium text-slate-300">
              Buscar
            </label>
            <input
              id="refiners-q"
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={60}
              placeholder="Nombre, título o anexo"
              className="w-52 rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="refiners-dept" className="mb-1 block text-xs font-medium text-slate-300">
              Departamento
            </label>
            <select
              id="refiners-dept"
              value={state.departmentId === null ? '' : String(state.departmentId)}
              onChange={(e) => actualizar({ departmentId: e.target.value === '' ? null : e.target.value, page: null })}
              className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
            >
              <option value="">Todos</option>
              {departamentos.map((depto) => (
                <option key={depto.id} value={depto.id}>
                  {depto.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="refiners-size" className="mb-1 block text-xs font-medium text-slate-300">
              Por página
            </label>
            <select
              id="refiners-size"
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
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="h-36 animate-pulse rounded-lg border border-slate-700 bg-slate-800/60" />
          ))}
        </ul>
      )}

      {!loading && data !== null && data.content.length === 0 && error === null && (
        <p className="rounded-md border border-slate-700 bg-slate-800/40 px-4 py-6 text-center text-slate-300">
          No hay expedientes con estos filtros.
        </p>
      )}

      {data !== null && data.content.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.content.map((refiner) => (
            <li
              key={refiner.id}
              className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 transition-colors hover:border-emerald-500/60"
            >
              <div className="flex gap-3">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md border border-slate-600 bg-slate-900">
                  {refiner.badge !== null ? (
                    <img
                      src={refiner.badge.url}
                      alt={`Fotocheck de ${refiner.fullName}`}
                      width={refiner.badge.width}
                      height={refiner.badge.height}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl text-slate-600" aria-hidden="true">
                      ◇
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-semibold text-emerald-100">{refiner.fullName}</h2>
                  <p className="truncate text-sm text-slate-300">{refiner.title}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {refiner.department.name} · anexo {refiner.extension}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{refiner.bio}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {puedeEscribir && (
                  <>
                    <Link
                      to={`/refiners/${refiner.id}/edit`}
                      className="rounded-md border border-slate-600 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700"
                    >
                      Editar expediente
                    </Link>
                    <Link
                      to={`/refiners/${refiner.id}/badge`}
                      className="rounded-md border border-slate-600 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700"
                    >
                      Fotocheck
                    </Link>
                  </>
                )}
                {refiner.profileUrl !== null && esHttp(refiner.profileUrl) && (
                  <a
                    href={refiner.profileUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="rounded-md border border-slate-600 px-3 py-1 text-xs font-medium text-emerald-300 hover:bg-slate-800"
                  >
                    Perfil externo
                  </a>
                )}
                <span className="ml-auto text-xs text-slate-500">v{refiner.version}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data !== null && totalPaginas > 1 && (
        <nav aria-label="Paginación de expedientes" className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={paginaSegura === 0}
            onClick={() => actualizar({ page: String(paginaSegura - 1) })}
            className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-sm text-slate-300">
            Página {paginaSegura + 1} de {totalPaginas} · {data.totalElements} expedientes
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
