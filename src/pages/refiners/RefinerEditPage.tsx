import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchDepartments, fetchRefiner, patchRefiner } from '../../api/lumon'
import type { Department, Refiner } from '../../api/schemas'
import { ApiError } from '../../api/http'
import { useEvents } from '../../events/EventsProvider'

interface Campos {
  title: string
  extension: string
  bio: string
  departmentId: string
}

const CAMPOS: Array<{ clave: keyof Campos; etiqueta: string }> = [
  { clave: 'title', etiqueta: 'Título' },
  { clave: 'extension', etiqueta: 'Anexo' },
  { clave: 'bio', etiqueta: 'Biografía' },
  { clave: 'departmentId', etiqueta: 'Departamento' },
]

function camposDe(refiner: Refiner): Campos {
  return {
    title: refiner.title,
    extension: refiner.extension,
    bio: refiner.bio,
    departmentId: String(refiner.department.id),
  }
}

function textoDe(campo: keyof Campos, valor: string, departamentos: Department[]): string {
  if (campo === 'departmentId') {
    const id = Number(valor)
    return departamentos.find((d) => d.id === id)?.name ?? `Departamento ${valor}`
  }
  return valor
}

function patchDesde(campos: Campos): { title: string; extension: string; bio: string; departmentId: number } {
  return {
    title: campos.title,
    extension: campos.extension,
    bio: campos.bio,
    departmentId: Number(campos.departmentId),
  }
}

export default function RefinerEditPage() {
  const { id } = useParams()
  const refinerId = Number(id)
  const { subscribe } = useEvents()

  const [refiner, setRefiner] = useState<Refiner | null>(null)
  const [etag, setEtag] = useState<string | null>(null)
  const [departamentos, setDepartamentos] = useState<Department[]>([])
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [avisoVersion, setAvisoVersion] = useState<string | null>(null)

  const [campos, setCampos] = useState<Campos | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [conflicto, setConflicto] = useState<{ servidor: Refiner; etag: string | null } | null>(null)
  const [eleccion, setEleccion] = useState<Record<keyof Campos, 'mio' | 'servidor'>>({
    title: 'mio',
    extension: 'mio',
    bio: 'mio',
    departmentId: 'mio',
  })

  useEffect(() => {
    if (!Number.isInteger(refinerId) || refinerId < 1) {
      setErrorCarga('El expediente no existe.')
      return
    }
    const controller = new AbortController()
    setErrorCarga(null)
    Promise.all([fetchRefiner(refinerId, controller.signal), fetchDepartments(controller.signal)])
      .then(([{ refiner, etag }, departamentos]) => {
        setRefiner(refiner)
        setEtag(etag)
        setDepartamentos(departamentos)
        setCampos(camposDe(refiner))
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          return
        }
        setErrorCarga(err instanceof ApiError ? err.message : 'No se pudo cargar el expediente.')
      })
    return () => {
      controller.abort()
    }
  }, [refinerId])

  useEffect(() => {
    return subscribe((ev) => {
      if (ev.event !== 'refiner.updated') {
        return
      }
      const payload = ev.data as { id?: number; version?: number } | null
      if (payload?.id !== refinerId) {
        return
      }
      setRefiner((actual) => {
        if (actual === null || (payload.version ?? 0) <= actual.version) {
          return actual
        }
        setAvisoVersion(
          'El expediente cambió en el servidor mientras lo editabas. Al guardar se comprobará la versión y verás el conflicto si te toca decidir.',
        )
        setGuardado(false)
        return { ...actual, version: payload.version ?? actual.version + 1 }
      })
    })
  }, [subscribe, refinerId])

  const aplicarGuardado = (resultado: { refiner: Refiner; etag: string | null }) => {
    setRefiner(resultado.refiner)
    setEtag(resultado.etag)
    setCampos(camposDe(resultado.refiner))
    setGuardado(true)
    setAvisoVersion(null)
    setConflicto(null)
    setFieldErrors({})
    setError(null)
  }

  const enviarPatch = async (nuevoEtag: string, patch: { title: string; extension: string; bio: string; departmentId: number }) => {
    try {
      aplicarGuardado(await patchRefiner(refinerId, nuevoEtag, patch))
    } catch (err) {
      if (err instanceof ApiError && err.status === 412) {
        const detalles = err.details as { current?: Refiner } | null
        if (detalles?.current !== undefined) {
          setConflicto({ servidor: detalles.current, etag: err.etag })
        }
        return
      }
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        const detalles = err.details as { fields?: Record<string, string> } | null
        if (detalles?.fields !== undefined) {
          setFieldErrors(detalles.fields)
        }
        return
      }
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el expediente.')
    }
  }

  const guardar = async (ev: FormEvent) => {
    ev.preventDefault()
    if (campos === null || etag === null) {
      return
    }
    if (!/^[0-9]{3,6}$/.test(campos.extension)) {
      setFieldErrors({ extension: 'El anexo debe tener entre 3 y 6 dígitos.' })
      return
    }
    setGuardando(true)
    setError(null)
    setFieldErrors({})
    setGuardado(false)
    await enviarPatch(etag, patchDesde(campos))
    setGuardando(false)
  }

  const resolverConflicto = async () => {
    if (campos === null || conflicto === null) {
      return
    }
    const servidor = camposDe(conflicto.servidor)
    const mezcla: Campos = {
      title: eleccion.title === 'mio' ? campos.title : servidor.title,
      extension: eleccion.extension === 'mio' ? campos.extension : servidor.extension,
      bio: eleccion.bio === 'mio' ? campos.bio : servidor.bio,
      departmentId: eleccion.departmentId === 'mio' ? campos.departmentId : servidor.departmentId,
    }
    let etagConflicto = conflicto.etag
    if (etagConflicto === null) {
      try {
        etagConflicto = (await fetchRefiner(refinerId)).etag
      } catch {
        setError('No se pudo leer la versión actual del expediente.')
        return
      }
    }
    if (etagConflicto === null) {
      setError('No se pudo obtener el ETag actual del expediente.')
      return
    }
    setGuardando(true)
    await enviarPatch(etagConflicto, patchDesde(mezcla))
    setGuardando(false)
  }

  if (errorCarga !== null) {
    return (
      <div className="grid gap-3">
        <p role="alert" className="rounded-md border border-red-700/60 bg-red-900/30 px-4 py-3 text-sm text-red-200">
          {errorCarga}
        </p>
        <Link to="/refiners" className="text-emerald-300 hover:underline">
          ← Volver al directorio
        </Link>
      </div>
    )
  }

  if (refiner === null || campos === null) {
    return <p className="text-slate-300">Cargando…</p>
  }

  return (
    <div className="grid max-w-2xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-emerald-100">Editar expediente</h1>
          <p className="text-sm text-slate-400">
            {refiner.fullName} · versión {refiner.version}
          </p>
        </div>
        <Link to="/refiners" className="text-slate-300 hover:text-emerald-300">
          ← Directorio
        </Link>
      </div>

      {avisoVersion !== null && (
        <p role="status" className="rounded-md border border-amber-600/50 bg-amber-900/30 px-3 py-2 text-sm text-amber-200">
          {avisoVersion}
        </p>
      )}
      {guardado && conflicto === null && (
        <p role="status" className="rounded-md border border-emerald-600/50 bg-emerald-900/30 px-3 py-2 text-sm text-emerald-200">
          Expediente guardado (versión {refiner.version}).
        </p>
      )}

      <form onSubmit={guardar} noValidate className="grid gap-4">
        <div>
          <label htmlFor="edit-title" className="mb-1 block text-sm font-medium text-slate-200">
            Título
          </label>
          <input
            id="edit-title"
            type="text"
            value={campos.title}
            maxLength={200}
            onChange={(e) => setCampos({ ...campos, title: e.target.value })}
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100"
          />
          {fieldErrors.title !== undefined && <p className="mt-1 text-sm text-red-300">{fieldErrors.title}</p>}
        </div>
        <div>
          <label htmlFor="edit-extension" className="mb-1 block text-sm font-medium text-slate-200">
            Anexo
          </label>
          <input
            id="edit-extension"
            type="text"
            value={campos.extension}
            inputMode="numeric"
            onChange={(e) => setCampos({ ...campos, extension: e.target.value })}
            className="w-40 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100"
          />
          {fieldErrors.extension !== undefined && <p className="mt-1 text-sm text-red-300">{fieldErrors.extension}</p>}
        </div>
        <div>
          <label htmlFor="edit-department" className="mb-1 block text-sm font-medium text-slate-200">
            Departamento
          </label>
          <select
            id="edit-department"
            value={campos.departmentId}
            onChange={(e) => setCampos({ ...campos, departmentId: e.target.value })}
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100"
          >
            {departamentos.map((depto) => (
              <option key={depto.id} value={depto.id}>
                {depto.name}
              </option>
            ))}
          </select>
          {fieldErrors.departmentId !== undefined && <p className="mt-1 text-sm text-red-300">{fieldErrors.departmentId}</p>}
        </div>
        <div>
          <label htmlFor="edit-bio" className="mb-1 block text-sm font-medium text-slate-200">
            Biografía
          </label>
          <textarea
            id="edit-bio"
            value={campos.bio}
            maxLength={2000}
            rows={5}
            onChange={(e) => setCampos({ ...campos, bio: e.target.value })}
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100"
          />
          {fieldErrors.bio !== undefined && <p className="mt-1 text-sm text-red-300">{fieldErrors.bio}</p>}
        </div>
        {error !== null && (
          <p role="alert" className="rounded-md border border-red-700/60 bg-red-900/30 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={guardando}
            className="rounded-md bg-emerald-500 px-4 py-2 font-semibold text-slate-900 hover:bg-emerald-400 disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          <Link
            to="/refiners"
            className="rounded-md border border-slate-600 px-4 py-2 font-medium text-slate-200 hover:bg-slate-800"
          >
            Cancelar
          </Link>
        </div>
      </form>

      {conflicto !== null && (
        <section
          role="alertdialog"
          aria-labelledby="conflicto-titulo"
          className="rounded-lg border border-amber-500/70 bg-amber-950/40 p-4"
        >
          <h2 id="conflicto-titulo" className="mb-1 text-lg font-semibold text-amber-200">
            El expediente cambió en el servidor
          </h2>
          <p className="mb-3 text-sm text-amber-100/90">
            Otra persona (o el Sr. Milchick) guardó la versión {conflicto.servidor.version} mientras editabas la{' '}
            {refiner.version}. Elige campo por campo qué conservar antes de reintentar con el ETag nuevo.
          </p>
          <div className="grid gap-3">
            {CAMPOS.map(({ clave, etiqueta }) => (
              <fieldset key={clave} className="rounded-md border border-amber-700/50 bg-slate-900/60 p-3">
                <legend className="px-1 text-sm font-semibold text-amber-100">{etiqueta}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex items-start gap-2 text-sm text-slate-200">
                    <input
                      type="radio"
                      name={`conflicto-${clave}`}
                      checked={eleccion[clave] === 'mio'}
                      onChange={() => setEleccion({ ...eleccion, [clave]: 'mio' })}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-xs uppercase text-slate-400">Lo que escribiste</span>
                      {textoDe(clave, campos[clave], departamentos) || '(vacío)'}
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm text-slate-200">
                    <input
                      type="radio"
                      name={`conflicto-${clave}`}
                      checked={eleccion[clave] === 'servidor'}
                      onChange={() => setEleccion({ ...eleccion, [clave]: 'servidor' })}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-xs uppercase text-slate-400">Lo que hay en el servidor</span>
                      {textoDe(clave, camposDe(conflicto.servidor)[clave], departamentos) || '(vacío)'}
                    </span>
                  </label>
                </div>
              </fieldset>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void resolverConflicto()}
              disabled={guardando}
              className="rounded-md bg-amber-400 px-4 py-2 font-semibold text-slate-900 hover:bg-amber-300 disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Guardar con el ETag nuevo'}
            </button>
            <button
              type="button"
              onClick={() => {
                setConflicto(null)
                setAvisoVersion(null)
              }}
              className="rounded-md border border-slate-600 px-4 py-2 font-medium text-slate-200 hover:bg-slate-800"
            >
              Seguir editando
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
