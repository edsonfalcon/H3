import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createIncident } from '../../api/lumon'
import { fetchFiles } from '../../api/files'
import type { DataFile } from '../../api/schemas'
import { ApiError } from '../../api/http'
import { cargarBitmap, fotoEscalada, type ImagenLista } from '../../media/imagen'
import { subirImagen, SubidaCanceladaError, type ControlSubida, type EtapaSubida } from '../../media/subida'

const MIN_LADO_MAYOR = 800
const MAX_LADO_MAYOR = 1600
const MAX_BYTES = 307200
const MAX_FOTOS = 3

type Severidad = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

const SEVERIDADES: Array<{ valor: Severidad; etiqueta: string }> = [
  { valor: 'LOW', etiqueta: 'Baja' },
  { valor: 'MEDIUM', etiqueta: 'Media' },
  { valor: 'HIGH', etiqueta: 'Alta' },
  { valor: 'CRITICAL', etiqueta: 'Crítica' },
]

type EstadoFoto = 'preparando' | 'listo' | 'subiendo' | 'confirmada' | 'error'

interface Foto {
  idLocal: number
  nombre: string
  url: string
  estado: EstadoFoto
  etapa: EtapaSubida | null
  avance: number
  mediaId: number | null
  error: string | null
  imagen: ImagenLista | null
}

const ETIQUETAS_ETAPA: Record<EtapaSubida, string> = {
  ticket: 'Pidiendo permiso a Lumon…',
  subiendo: 'Subiendo al storage…',
  confirmando: 'Confirmando con Lumon…',
}

function etiquetaEstado(foto: Foto): string {
  switch (foto.estado) {
    case 'preparando':
      return 'Preparando la foto…'
    case 'listo':
      return 'Lista para subir'
    case 'subiendo':
      return foto.etapa !== null ? ETIQUETAS_ETAPA[foto.etapa] : 'Subiendo…'
    case 'confirmada':
      return `Subida (media #${foto.mediaId})`
    case 'error':
      return `Error: ${foto.error ?? 'no se pudo subir'}`
  }
}

export default function IncidentNewPage() {
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<Severidad>('LOW')
  const [fileId, setFileId] = useState('')
  const [archivos, setArchivos] = useState<DataFile[]>([])
  const [fotos, setFotos] = useState<Foto[]>([])
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const seqFotoRef = useRef(0)
  const controlsRef = useRef(new Map<number, ControlSubida>())
  const urlsRef = useRef(new Set<string>())
  const fotosRef = useRef(fotos)
  fotosRef.current = fotos

  useEffect(() => {
    const controller = new AbortController()
    fetchFiles({ page: 0, size: 50, status: null, q: null, sort: 'name,asc' }, controller.signal)
      .then((page) => {
        setArchivos(page.content)
      })
      .catch(() => {})
    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    const controls = controlsRef.current
    const urls = urlsRef.current
    return () => {
      for (const control of controls.values()) {
        control.cancelar()
      }
      for (const url of urls) {
        URL.revokeObjectURL(url)
      }
    }
  }, [])

  const iniciarSubida = useCallback((idLocal: number, imagen: ImagenLista) => {
    const control = subirImagen('INCIDENT', imagen, (etapa, avance) => {
      setFotos((prev) => prev.map((f) => (f.idLocal === idLocal ? { ...f, etapa, avance } : f)))
    })
    controlsRef.current.set(idLocal, control)
    setFotos((prev) =>
      prev.map((f) => (f.idLocal === idLocal ? { ...f, estado: 'subiendo', etapa: 'ticket', avance: 0, error: null } : f)),
    )
    void control.promesa
      .then((media) => {
        controlsRef.current.delete(idLocal)
        setFotos((prev) =>
          prev.map((f) =>
            f.idLocal === idLocal ? { ...f, estado: 'confirmada', mediaId: media.mediaId, etapa: null, avance: 0, error: null } : f,
          ),
        )
      })
      .catch((err: unknown) => {
        controlsRef.current.delete(idLocal)
        if (err instanceof SubidaCanceladaError) {
          setFotos((prev) =>
            prev.map((f) =>
              f.idLocal === idLocal && f.estado === 'subiendo'
                ? { ...f, estado: f.imagen !== null ? 'listo' : 'preparando', etapa: null, error: null }
                : f,
            ),
          )
          return
        }
        const mensaje = err instanceof Error ? err.message : 'No se pudo subir la foto.'
        setFotos((prev) => prev.map((f) => (f.idLocal === idLocal ? { ...f, estado: 'error', etapa: null, error: mensaje } : f)))
      })
  }, [])

  const prepararFoto = useCallback(
    async (idLocal: number, archivo: File) => {
      let imagen: ImagenLista
      try {
        const bitmap = await cargarBitmap(archivo)
        try {
          imagen = await fotoEscalada(bitmap, MIN_LADO_MAYOR, MAX_LADO_MAYOR, MAX_BYTES)
        } finally {
          bitmap.close()
        }
      } catch (err) {
        const mensaje = err instanceof Error ? err.message : 'No se pudo procesar la imagen.'
        setFotos((prev) => prev.map((f) => (f.idLocal === idLocal ? { ...f, estado: 'error', error: mensaje } : f)))
        return
      }
      if (!fotosRef.current.some((f) => f.idLocal === idLocal)) {
        return
      }
      setFotos((prev) => prev.map((f) => (f.idLocal === idLocal ? { ...f, imagen } : f)))
      iniciarSubida(idLocal, imagen)
    },
    [iniciarSubida],
  )

  const agregarFotos = useCallback(
    (lista: File[]) => {
      const imagenes = lista.filter((f) => f.type.startsWith('image/'))
      if (imagenes.length === 0) {
        return
      }
      const espacios = MAX_FOTOS - fotosRef.current.length
      if (espacios <= 0) {
        setError('Solo se permiten 3 fotos por incidencia.')
        return
      }
      setError(null)
      for (const archivo of imagenes.slice(0, espacios)) {
        const idLocal = ++seqFotoRef.current
        const url = URL.createObjectURL(archivo)
        urlsRef.current.add(url)
        setFotos((prev) => [
          ...prev,
          { idLocal, nombre: archivo.name, url, estado: 'preparando', etapa: null, avance: 0, mediaId: null, error: null, imagen: null },
        ])
        void prepararFoto(idLocal, archivo)
      }
    },
    [prepararFoto],
  )

  useEffect(() => {
    const alPegar = (ev: ClipboardEvent) => {
      const archivosPegados = Array.from(ev.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
      if (archivosPegados.length > 0) {
        agregarFotos(archivosPegados)
      }
    }
    window.addEventListener('paste', alPegar)
    return () => {
      window.removeEventListener('paste', alPegar)
    }
  }, [agregarFotos])

  const quitarFoto = (idLocal: number) => {
    controlsRef.current.get(idLocal)?.cancelar()
    controlsRef.current.delete(idLocal)
    const foto = fotosRef.current.find((f) => f.idLocal === idLocal)
    if (foto !== undefined) {
      URL.revokeObjectURL(foto.url)
      urlsRef.current.delete(foto.url)
    }
    setFotos((prev) => prev.filter((f) => f.idLocal !== idLocal))
  }

  const cancelarFoto = (idLocal: number) => {
    controlsRef.current.get(idLocal)?.cancelar()
  }

  const reintentarFoto = (foto: Foto) => {
    if (foto.imagen !== null) {
      iniciarSubida(foto.idLocal, foto.imagen)
    }
  }

  const todasConfirmadas = fotos.length > 0 && fotos.every((f) => f.estado === 'confirmada')
  const fotosEnProceso = fotos.some((f) => f.estado === 'preparando' || f.estado === 'subiendo')

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!todasConfirmadas || enviando) {
      return
    }
    const errores: Record<string, string> = {}
    if (title.trim().length < 3 || title.trim().length > 120) {
      errores.title = 'El título debe tener entre 3 y 120 caracteres.'
    }
    if (description.trim().length < 1 || description.trim().length > 4000) {
      errores.description = 'La descripción es obligatoria (máximo 4000 caracteres).'
    }
    if (Object.keys(errores).length > 0) {
      setFieldErrors(errores)
      return
    }
    setEnviando(true)
    setError(null)
    setFieldErrors({})
    try {
      await createIncident({
        title: title.trim(),
        description: description.trim(),
        severity,
        fileId: fileId === '' ? null : Number(fileId),
        mediaIds: fotos.flatMap((f) => (f.mediaId !== null ? [f.mediaId] : [])),
      })
      navigate('/incidents')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        const detalles = err.details as { fields?: Record<string, string> } | null
        if (detalles?.fields !== undefined) {
          setFieldErrors(detalles.fields)
          return
        }
      }
      setError(err instanceof ApiError ? err.message : 'No se pudo crear la incidencia.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="grid max-w-2xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-emerald-100">Nueva incidencia</h1>
        <Link to="/incidents" className="text-slate-300 hover:text-emerald-300">
          ← Incidencias
        </Link>
      </div>

      <form onSubmit={enviar} noValidate className="grid gap-4">
        <div>
          <label htmlFor="inc-title" className="mb-1 block text-sm font-medium text-slate-200">
            Título
          </label>
          <input
            id="inc-title"
            type="text"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100"
          />
          {fieldErrors.title !== undefined && <p className="mt-1 text-sm text-red-300">{fieldErrors.title}</p>}
        </div>

        <div>
          <label htmlFor="inc-severity" className="mb-1 block text-sm font-medium text-slate-200">
            Severidad
          </label>
          <select
            id="inc-severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severidad)}
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100"
          >
            {SEVERIDADES.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.etiqueta}
              </option>
            ))}
          </select>
          {fieldErrors.severity !== undefined && <p className="mt-1 text-sm text-red-300">{fieldErrors.severity}</p>}
        </div>

        {archivos.length > 0 && (
          <div>
            <label htmlFor="inc-file" className="mb-1 block text-sm font-medium text-slate-200">
              Archivo relacionado (opcional)
            </label>
            <select
              id="inc-file"
              value={fileId}
              onChange={(e) => setFileId(e.target.value)}
              className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100"
            >
              <option value="">Ninguno</option>
              {archivos.map((archivo) => (
                <option key={archivo.id} value={archivo.id}>
                  {archivo.name}
                </option>
              ))}
            </select>
            {fieldErrors.fileId !== undefined && <p className="mt-1 text-sm text-red-300">{fieldErrors.fileId}</p>}
          </div>
        )}

        <div>
          <label htmlFor="inc-description" className="mb-1 block text-sm font-medium text-slate-200">
            Descripción
          </label>
          <textarea
            id="inc-description"
            value={description}
            maxLength={4000}
            rows={5}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100"
          />
          {fieldErrors.description !== undefined && <p className="mt-1 text-sm text-red-300">{fieldErrors.description}</p>}
        </div>

        <fieldset className="rounded-lg border border-slate-700 bg-slate-800/40 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-200">Fotos (1 a 3, obligatorias)</legend>
          <div
            onDragOver={(ev) => ev.preventDefault()}
            onDrop={(ev) => {
              ev.preventDefault()
              agregarFotos(Array.from(ev.dataTransfer.files))
            }}
            className="grid gap-2 rounded-md border-2 border-dashed border-slate-600 bg-slate-900/50 p-4 text-center text-sm text-slate-400"
          >
            <span aria-hidden="true" className="text-2xl">
              ◇
            </span>
            Arrastra imágenes aquí, pégalas desde el portapapeles o elígelas con el botón. Se ajustan al tamaño permitido
            (lado mayor 800–1600 px, máximo 300 KB) y se suben en paralelo.
            <label htmlFor="inc-fotos" className="sr-only">
              Elegir fotos de la incidencia
            </label>
            <input
              id="inc-fotos"
              type="file"
              accept="image/*"
              multiple
              disabled={fotos.length >= MAX_FOTOS}
              onChange={(e) => {
                agregarFotos(Array.from(e.target.files ?? []))
                e.target.value = ''
              }}
              className="mx-auto block w-full max-w-xs text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-500 file:px-3 file:py-1.5 file:font-medium file:text-slate-900 hover:file:bg-emerald-400 disabled:opacity-50"
            />
          </div>

          {fotos.length > 0 && (
            <ul className="mt-3 grid gap-3">
              {fotos.map((foto) => (
                <li key={foto.idLocal} className="flex flex-wrap items-start gap-3 rounded-md border border-slate-700 bg-slate-900/60 p-3">
                  <div className="h-20 w-28 shrink-0 overflow-hidden rounded-md border border-slate-600 bg-slate-900">
                    <img src={foto.url} alt={foto.nombre} className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">{foto.nombre}</p>
                    <p
                      role="status"
                      className={`text-xs ${foto.estado === 'error' ? 'text-red-300' : foto.estado === 'confirmada' ? 'text-emerald-300' : 'text-amber-200'}`}
                    >
                      {etiquetaEstado(foto)}
                    </p>
                    {foto.estado === 'subiendo' && (
                      <div
                        role="progressbar"
                        aria-valuenow={Math.round(foto.avance * 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Progreso de la subida de ${foto.nombre}`}
                        className="mt-1 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-700"
                      >
                        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.round(foto.avance * 100)}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {foto.estado === 'subiendo' && (
                      <button
                        type="button"
                        onClick={() => cancelarFoto(foto.idLocal)}
                        className="rounded-md border border-red-500 px-3 py-1 text-xs font-medium text-red-200 hover:bg-red-900/40"
                      >
                        Cancelar
                      </button>
                    )}
                    {foto.estado === 'listo' && foto.imagen !== null && (
                      <button
                        type="button"
                        onClick={() => reintentarFoto(foto)}
                        className="rounded-md border border-slate-600 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
                      >
                        Subir
                      </button>
                    )}
                    {foto.estado === 'error' && foto.imagen !== null && (
                      <button
                        type="button"
                        onClick={() => reintentarFoto(foto)}
                        className="rounded-md border border-slate-600 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
                      >
                        Reintentar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => quitarFoto(foto.idLocal)}
                      className="rounded-md border border-slate-600 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800"
                    >
                      Quitar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {fieldErrors.mediaIds !== undefined && <p className="mt-2 text-sm text-red-300">{fieldErrors.mediaIds}</p>}
        </fieldset>

        {error !== null && (
          <p role="alert" className="rounded-md border border-red-700/60 bg-red-900/30 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!todasConfirmadas || enviando}
            className="rounded-md bg-emerald-500 px-4 py-2 font-semibold text-slate-900 hover:bg-emerald-400 disabled:opacity-50"
          >
            {enviando ? 'Reportando…' : 'Reportar incidencia'}
          </button>
          <Link
            to="/incidents"
            className="rounded-md border border-slate-600 px-4 py-2 font-medium text-slate-200 hover:bg-slate-800"
          >
            Cancelar
          </Link>
          {!todasConfirmadas && fotos.length > 0 && fotosEnProceso && (
            <span className="text-xs text-amber-200">Espera a que todas las fotos terminen de subir.</span>
          )}
          {fotos.length === 0 && <span className="text-xs text-slate-400">Agrega al menos una foto.</span>}
        </div>
      </form>
    </div>
  )
}
