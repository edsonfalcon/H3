import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchRefiner, patchRefiner } from '../../api/lumon'
import type { Refiner } from '../../api/schemas'
import { ApiError } from '../../api/http'
import { cargarBitmap, recorteCuadrado } from '../../media/imagen'
import { subirImagen, type ControlSubida, type EtapaSubida } from '../../media/subida'
import { useEvents } from '../../events/EventsProvider'

const LADO_VISTA = 288
const TAMANO_BADGE = 512
const MAX_BYTES = 122880
const MIN_LADO = 24

function limitar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor))
}

export default function BadgePage() {
  const { id } = useParams()
  const refinerId = Number(id)
  const { subscribe } = useEvents()

  const [refiner, setRefiner] = useState<Refiner | null>(null)
  const [etag, setEtag] = useState<string | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [avisoVersion, setAvisoVersion] = useState<string | null>(null)

  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  const [urlPreview, setUrlPreview] = useState<string | null>(null)
  const [recorte, setRecorte] = useState({ x: 0, y: 0, lado: 1 })
  const [errorProceso, setErrorProceso] = useState<string | null>(null)
  const [etapa, setEtapa] = useState<EtapaSubida | null>(null)
  const [avance, setAvance] = useState(0)
  const [errorSubida, setErrorSubida] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const controlRef = useRef<ControlSubida | null>(null)
  const dragRef = useRef<{ x: number; y: number; recorte: { x: number; y: number } } | null>(null)

  useEffect(() => {
    if (!Number.isInteger(refinerId) || refinerId < 1) {
      setErrorCarga('El expediente no existe.')
      return
    }
    const controller = new AbortController()
    setErrorCarga(null)
    setRefiner(null)
    fetchRefiner(refinerId, controller.signal)
      .then(({ refiner, etag }) => {
        setRefiner(refiner)
        setEtag(etag)
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
      const payload = ev.data as { id?: number; version?: number; refiner?: Refiner } | null
      if (payload?.id !== refinerId || payload.refiner === undefined) {
        return
      }
      const refinerNuevo = payload.refiner
      const versionNueva = payload.version ?? refinerNuevo.version
      setRefiner((actual) => {
        if (actual === null || versionNueva <= actual.version) {
          return actual
        }
        setAvisoVersion('El expediente cambió mientras estabas aquí. Al guardar se usará la versión más reciente.')
        return refinerNuevo
      })
    })
  }, [subscribe, refinerId])

  useEffect(() => {
    return () => {
      if (urlPreview !== null) {
        URL.revokeObjectURL(urlPreview)
      }
      controlRef.current?.cancelar()
    }
  }, [urlPreview])

  const elegirArchivo = useCallback(async (archivo: File) => {
    if (!archivo.type.startsWith('image/')) {
      setErrorProceso('Ese archivo no es una imagen.')
      return
    }
    controlRef.current?.cancelar()
    setErrorProceso(null)
    setErrorSubida(null)
    setExito(null)
    setEtapa(null)
    try {
      const bmp = await cargarBitmap(archivo)
      const lado = Math.min(bmp.width, bmp.height)
      setBitmap(bmp)
      setRecorte({
        x: Math.floor((bmp.width - lado) / 2),
        y: Math.floor((bmp.height - lado) / 2),
        lado,
      })
      setUrlPreview((anterior) => {
        if (anterior !== null) {
          URL.revokeObjectURL(anterior)
        }
        return URL.createObjectURL(archivo)
      })
    } catch {
      setErrorProceso('No se pudo leer la imagen.')
    }
  }, [])

  useEffect(() => {
    const alPegar = (ev: ClipboardEvent) => {
      const archivo = Array.from(ev.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'))
      if (archivo !== undefined) {
        void elegirArchivo(archivo)
      }
    }
    window.addEventListener('paste', alPegar)
    return () => {
      window.removeEventListener('paste', alPegar)
    }
  }, [elegirArchivo])

  const moverRecorte = (dx: number, dy: number) => {
    setRecorte((actual) => {
      if (bitmap === null) {
        return actual
      }
      return {
        ...actual,
        x: limitar(actual.x + dx, 0, bitmap.width - actual.lado),
        y: limitar(actual.y + dy, 0, bitmap.height - actual.lado),
      }
    })
  }

  const escalarRecorte = (factor: number) => {
    setRecorte((actual) => {
      if (bitmap === null) {
        return actual
      }
      const ladoNuevo = limitar(actual.lado * factor, MIN_LADO, Math.min(bitmap.width, bitmap.height))
      const centroX = actual.x + actual.lado / 2
      const centroY = actual.y + actual.lado / 2
      return {
        lado: ladoNuevo,
        x: limitar(centroX - ladoNuevo / 2, 0, bitmap.width - ladoNuevo),
        y: limitar(centroY - ladoNuevo / 2, 0, bitmap.height - ladoNuevo),
      }
    })
  }

  const centrarRecorte = () => {
    setRecorte((actual) => {
      if (bitmap === null) {
        return actual
      }
      return {
        ...actual,
        x: limitar((bitmap.width - actual.lado) / 2, 0, bitmap.width - actual.lado),
        y: limitar((bitmap.height - actual.lado) / 2, 0, bitmap.height - actual.lado),
      }
    })
  }

  const onPointerDownVista = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (bitmap === null) {
      return
    }
    ev.currentTarget.setPointerCapture(ev.pointerId)
    dragRef.current = { x: ev.clientX, y: ev.clientY, recorte: { x: recorte.x, y: recorte.y } }
  }

  const onPointerMoveVista = (ev: ReactPointerEvent<HTMLDivElement>) => {
    const inicio = dragRef.current
    if (inicio === null || bitmap === null) {
      return
    }
    const escala = recorte.lado / LADO_VISTA
    const dx = (ev.clientX - inicio.x) * escala
    const dy = (ev.clientY - inicio.y) * escala
    setRecorte({
      lado: recorte.lado,
      x: limitar(inicio.recorte.x - dx, 0, bitmap.width - recorte.lado),
      y: limitar(inicio.recorte.y - dy, 0, bitmap.height - recorte.lado),
    })
  }

  const onPointerUpVista = () => {
    dragRef.current = null
  }

  const onWheelVista = (ev: React.WheelEvent<HTMLDivElement>) => {
    if (bitmap === null) {
      return
    }
    ev.preventDefault()
    escalarRecorte(ev.deltaY < 0 ? 0.92 : 1.08)
  }

  const onTeclaVista = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    if (bitmap === null) {
      return
    }
    const paso = Math.max(2, Math.round(recorte.lado / 24))
    switch (ev.key) {
      case 'ArrowUp':
        moverRecorte(0, -paso)
        break
      case 'ArrowDown':
        moverRecorte(0, paso)
        break
      case 'ArrowLeft':
        moverRecorte(-paso, 0)
        break
      case 'ArrowRight':
        moverRecorte(paso, 0)
        break
      case '+':
      case '=':
        escalarRecorte(0.92)
        break
      case '-':
      case '_':
        escalarRecorte(1.08)
        break
      case 'Home':
        centrarRecorte()
        break
      default:
        return
    }
    ev.preventDefault()
  }

  const cancelarSubida = () => {
    controlRef.current?.cancelar()
  }

  const confirmar = async () => {
    if (bitmap === null || refiner === null || etag === null) {
      return
    }
    setErrorSubida(null)
    setErrorProceso(null)
    setExito(null)
    setAvance(0)
    setEtapa('ticket')
    try {
      const imagen = await recorteCuadrado(bitmap, Math.round(recorte.x), Math.round(recorte.y), Math.round(recorte.lado), TAMANO_BADGE, MAX_BYTES)
      const control = subirImagen('BADGE', imagen, (nuevaEtapa, nuevoAvance) => {
        setEtapa(nuevaEtapa)
        setAvance(nuevoAvance)
      })
      controlRef.current = control
      const media = await control.promesa
      let resultado: { refiner: Refiner; etag: string | null }
      try {
        resultado = await patchRefiner(refinerId, etag, { badgeMediaId: media.mediaId })
      } catch (err) {
        if (err instanceof ApiError && err.status === 412) {
          const fresco = await fetchRefiner(refinerId)
          resultado = await patchRefiner(refinerId, fresco.etag ?? etag, { badgeMediaId: media.mediaId })
        } else {
          throw err
        }
      }
      setRefiner(resultado.refiner)
      setEtag(resultado.etag)
      setAvisoVersion(null)
      setBitmap(null)
      setUrlPreview((anterior) => {
        if (anterior !== null) {
          URL.revokeObjectURL(anterior)
        }
        return null
      })
      setRecorte({ x: 0, y: 0, lado: 1 })
      setExito('Fotocheck actualizado.')
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'MEDIA_VERIFICATION_FAILED') {
          const detalles = err.details as { reason?: string } | null
          const motivo =
            detalles?.reason === 'METADATA_PRESENT'
              ? ' La imagen quedó con metadatos (EXIF o XMP): vuelve a elegirla e inténtalo de nuevo.'
              : detalles?.reason === 'DIMENSIONS'
                ? ' Las dimensiones no son exactamente 512 × 512.'
                : detalles?.reason === 'SIZE'
                  ? ' La imagen supera los 120 KB.'
                  : ''
          setErrorSubida(`${err.message}${motivo}`)
        } else if (err.code === 'STORAGE_NOT_VERIFIED') {
          setErrorSubida(`${err.message} Verifica el storage en /estado.`)
        } else {
          setErrorSubida(err.message)
        }
      } else if (err instanceof Error && err.message === 'La subida se canceló.') {
        setErrorSubida('La subida se canceló.')
      } else {
        setErrorSubida('No se pudo actualizar el fotocheck.')
      }
    } finally {
      setEtapa(null)
      setAvance(0)
    }
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

  const escala = LADO_VISTA / recorte.lado
  const ocupado = etapa !== null
  const etiquetaEtapa =
    etapa === 'ticket'
      ? 'Pidiendo permiso a Lumon…'
      : etapa === 'subiendo'
        ? 'Subiendo al storage…'
        : etapa === 'confirmando'
          ? 'Confirmando con Lumon…'
          : ''

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-emerald-100">Fotocheck</h1>
          <p className="text-sm text-slate-400">{refiner?.fullName ?? 'Cargando…'}</p>
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
      {exito !== null && (
        <p role="status" className="rounded-md border border-emerald-600/50 bg-emerald-900/30 px-3 py-2 text-sm text-emerald-200">
          {exito}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        <section className="grid justify-items-center gap-3">
          <div
            onDragOver={(ev) => ev.preventDefault()}
            onDrop={(ev) => {
              ev.preventDefault()
              const archivo = ev.dataTransfer.files[0]
              if (archivo !== undefined) {
                void elegirArchivo(archivo)
              }
            }}
            tabIndex={0}
            role="application"
            aria-label="Área de recorte del fotocheck: arrastra para mover, rueda o más y menos para el zoom, flechas para mover con el teclado"
            onKeyDown={onTeclaVista}
            onPointerDown={onPointerDownVista}
            onPointerMove={onPointerMoveVista}
            onPointerUp={onPointerUpVista}
            onPointerCancel={onPointerUpVista}
            onWheel={onWheelVista}
            className="relative touch-none overflow-hidden rounded-lg border-2 border-emerald-500/70 bg-slate-900"
            style={{ width: LADO_VISTA, height: LADO_VISTA }}
          >
            {urlPreview !== null && bitmap !== null ? (
              <img
                src={urlPreview}
                alt="Vista previa del recorte"
                draggable={false}
                className="pointer-events-none absolute select-none"
                style={{
                  left: -recorte.x * escala,
                  top: -recorte.y * escala,
                  width: bitmap.width * escala,
                  height: bitmap.height * escala,
                }}
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-slate-500">
                <span aria-hidden="true" className="text-3xl">
                  ◇
                </span>
                Arrastra una imagen aquí, pégala o elégela con el botón
              </div>
            )}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 border border-white/10" />
          </div>
          <label htmlFor="badge-archivo" className="sr-only">
            Elegir imagen del fotocheck
          </label>
          <input
            id="badge-archivo"
            type="file"
            accept="image/*"
            onChange={(e) => {
              const archivo = e.target.files?.[0]
              if (archivo !== undefined) {
                void elegirArchivo(archivo)
              }
              e.target.value = ''
            }}
            className="block w-full max-w-xs text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-500 file:px-3 file:py-1.5 file:font-medium file:text-slate-900 hover:file:bg-emerald-400"
          />
          {bitmap !== null && (
            <div className="grid w-full max-w-xs gap-1">
              <label htmlFor="badge-zoom" className="text-xs text-slate-400">
                Zoom ({Math.round((recorte.lado / Math.min(bitmap.width, bitmap.height)) * 100)}%)
              </label>
              <input
                id="badge-zoom"
                type="range"
                min={MIN_LADO}
                max={Math.min(bitmap.width, bitmap.height)}
                value={recorte.lado}
                onChange={(e) => escalarRecorte(Number(e.target.value) / recorte.lado)}
                className="w-full"
              />
            </div>
          )}
        </section>

        <section className="grid content-start gap-4">
          <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Fotocheck actual</h2>
            {refiner !== null && refiner.badge !== null ? (
              <img
                src={refiner.badge.url}
                alt={`Fotocheck de ${refiner.fullName}`}
                width={refiner.badge.width}
                height={refiner.badge.height}
                className="h-24 w-24 rounded-md border border-slate-600 object-cover"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-md border border-slate-600 bg-slate-900 text-3xl text-slate-600" aria-hidden="true">
                ◇
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 text-sm text-slate-300">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Requisitos</h2>
            <ul className="grid gap-1">
              <li>Recorte cuadrado, salida exactamente 512 × 512</li>
              <li>Formato WebP sin metadatos, máximo 120 KB</li>
              <li>Se sube con permiso de Lumon (ticket) y se confirma su descarga</li>
            </ul>
          </div>

          {errorProceso !== null && (
            <p role="alert" className="rounded-md border border-red-700/60 bg-red-900/30 px-3 py-2 text-sm text-red-200">
              {errorProceso}
            </p>
          )}
          {errorSubida !== null && (
            <p role="alert" className="rounded-md border border-red-700/60 bg-red-900/30 px-3 py-2 text-sm text-red-200">
              {errorSubida}
            </p>
          )}

          {etapa !== null && (
            <div className="grid gap-2">
              <p role="status" className="text-sm text-amber-200">
                {etiquetaEtapa}
              </p>
              <div
                role="progressbar"
                aria-valuenow={Math.round(avance * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progreso de la subida"
                className="h-2 w-full overflow-hidden rounded-full bg-slate-700"
              >
                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.round(avance * 100)}%` }} />
              </div>
              <button
                type="button"
                onClick={cancelarSubida}
                className="w-fit rounded-md border border-red-500 px-3 py-1 text-sm font-medium text-red-200 hover:bg-red-900/40"
              >
                Cancelar subida
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void confirmar()}
              disabled={bitmap === null || ocupado}
              className="rounded-md bg-emerald-500 px-4 py-2 font-semibold text-slate-900 hover:bg-emerald-400 disabled:opacity-50"
            >
              {ocupado ? 'Trabajando…' : 'Confirmar fotocheck'}
            </button>
            {etapa === null && errorSubida !== null && bitmap !== null && (
              <button
                type="button"
                onClick={() => void confirmar()}
                className="rounded-md border border-slate-600 px-4 py-2 font-medium text-slate-200 hover:bg-slate-800"
              >
                Reintentar
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
