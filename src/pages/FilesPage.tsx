import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchFiles, type FileListQuery } from '../api/files'
import type { FilePage } from '../api/schemas'
import { ApiError } from '../api/http'
import { useDebouncedValue } from '../hooks/useDebouncedValue'

const SORTS = ['updatedAt,desc', 'progress,desc', 'name,asc'] as const
const SIZES = [10, 25, 50] as const
const STATUSES = ['', 'ACTIVE', 'COMPLETE'] as const
const SORT_LABELS: Record<string, string> = {
  'updatedAt,desc': 'Actualización',
  'progress,desc': 'Progreso',
  'name,asc': 'Nombre',
}

function sanitizar(params: URLSearchParams) {
  const pageRaw = Number(params.get('page'))
  const sizeRaw = Number(params.get('size'))
  const statusRaw = params.get('status') ?? ''
  const sortRaw = params.get('sort') ?? 'updatedAt,desc'
  const qRaw = params.get('q') ?? ''

  const size = (SIZES as readonly number[]).includes(sizeRaw) ? sizeRaw : 10
  const status = (STATUSES as readonly string[]).includes(statusRaw) ? statusRaw : ''
  const sort = (SORTS as readonly string[]).includes(sortRaw) ? sortRaw : 'updatedAt,desc'
  const page = Number.isInteger(pageRaw) && pageRaw >= 0 ? pageRaw : 0
  const q = qRaw.slice(0, 60)

  return { page, size, status, sort, q }
}

export default function FilesPage() {
  const [params, setParams] = useSearchParams()
  const state = useMemo(() => sanitizar(params), [params])

  const [texto, setTexto] = useState(state.q)
  const textoDebounced = useDebouncedValue(texto, 400)
  const [data, setData] = useState<FilePage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refresco, setRefresco] = useState(0)

  const seqRef = useRef(0)

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
    const query: FileListQuery = {
      page: state.page,
      size: state.size,
      status: state.status === '' ? null : (state.status as 'ACTIVE' | 'COMPLETE'),
      q: state.q === '' ? null : state.q,
      sort: state.sort as FileListQuery['sort'],
    }
    const seq = ++seqRef.current
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetchFiles(query, controller.signal)
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
          setError('No se pudo cargar la lista de archivos.')
        }
        setLoading(false)
      })
    return () => {
      controller.abort()
    }
  }, [state.page, state.size, state.status, state.q, state.sort, refresco])

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

  const cambiarPagina = (page: number) => {
    actualizar({ page: String(page) })
  }

  const totalPaginas = data?.totalPages ?? 1
  const paginaSegura = Math.min(state.page, Math.max(0, totalPaginas - 1))

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold text-emerald-100">Archivos de datos</h1>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="files-q" className="mb-1 block text-xs font-medium text-slate-300">
              Buscar
            </label>
            <input
              id="files-q"
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={60}
              placeholder="Nombre del archivo"
              className="w-52 rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="files-status" className="mb-1 block text-xs font-medium text-slate-300">
              Estado
            </label>
            <select
              id="files-status"
              value={state.status}
              onChange={(e) => actualizar({ status: e.target.value, page: null })}
              className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
            >
              <option value="">Todos</option>
              <option value="ACTIVE">Activos</option>
              <option value="COMPLETE">Completados</option>
            </select>
          </div>
          <div>
            <label htmlFor="files-sort" className="mb-1 block text-xs font-medium text-slate-300">
              Orden
            </label>
            <select
              id="files-sort"
              value={state.sort}
              onChange={(e) => actualizar({ sort: e.target.value })}
              className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
            >
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="files-size" className="mb-1 block text-xs font-medium text-slate-300">
              Por página
            </label>
            <select
              id="files-size"
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
            <li key={i} className="h-28 animate-pulse rounded-lg border border-slate-700 bg-slate-800/60" />
          ))}
        </ul>
      )}

      {!loading && data !== null && data.content.length === 0 && error === null && (
        <p className="rounded-md border border-slate-700 bg-slate-800/40 px-4 py-6 text-center text-slate-300">
          No hay archivos con estos filtros.
        </p>
      )}

      {data !== null && data.content.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.content.map((file) => (
            <li key={file.id}>
              <Link
                to={`/files/${file.id}/refine`}
                className="block rounded-lg border border-slate-700 bg-slate-800/50 p-4 transition-colors hover:border-emerald-500/60 hover:bg-slate-800"
              >
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <h2 className="truncate font-semibold text-emerald-100">{file.name}</h2>
                  <span className="text-xs text-slate-400">
                    {file.rows}×{file.cols}
                  </span>
                </div>
                <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
                  <div
                    className="h-full rounded-full bg-emerald-400"
                    style={{ width: `${Math.round(file.progress.overall * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400">
                  {file.status === 'COMPLETE' ? 'Completado' : 'Activo'} ·{' '}
                  {Math.round(file.progress.overall * 100)}% · {file.refinedGroups}/{file.totalGroups} grupos ·{' '}
                  {file.mistakes} errores
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {data !== null && totalPaginas > 1 && (
        <nav aria-label="Paginación de archivos" className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={paginaSegura === 0}
            onClick={() => cambiarPagina(paginaSegura - 1)}
            className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-sm text-slate-300">
            Página {paginaSegura + 1} de {totalPaginas} · {data.totalElements} archivos
          </span>
          <button
            type="button"
            disabled={paginaSegura >= totalPaginas - 1}
            onClick={() => cambiarPagina(paginaSegura + 1)}
            className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 disabled:opacity-40"
          >
            Siguiente
          </button>
        </nav>
      )}
    </div>
  )
}
