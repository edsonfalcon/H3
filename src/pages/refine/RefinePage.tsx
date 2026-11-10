import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { fetchFile, fetchRules } from '../../api/files'
import type { DataFile, Rules, Progress } from '../../api/schemas'
import { ApiError } from '../../api/http'
import { TileStore, type Celda } from '../../refine/tileStore'
import { GrillaVirtual, irA, DIMENSIONES } from '../../refine/GrillaVirtual'
import { OverlayCursores, type CursorOverlay } from '../../refine/OverlayCursores'
import { usePiso } from '../../refine/usePiso'
import { useEvents } from '../../events/EventsProvider'
import { useSession } from '../../auth/SessionContext'
import { Cajas, type Bin } from './Cajas'
import { useRefinar } from './useRefinar'

const COLORES = ['#f59e0b', '#38bdf8', '#a78bfa', '#fb7185', '#34d399', '#e879f9']

function letraDeBin(bin: string): 'W' | 'F' | 'D' | 'M' {
  return bin[0] as 'W' | 'F' | 'D' | 'M'
}

interface Seleccion {
  cells: Celda[]
  conjunto: Set<string>
  size: number
  esperada: Bin | null
  ruido: boolean
  reservadaPor: string | null
}

export default function RefinePage() {
  const { id } = useParams()
  const fileId = Number(id)
  const [params, setParams] = useSearchParams()
  const { me } = useSession()
  const { subscribe } = useEvents()

  const [archivo, setArchivo] = useState<DataFile | null>(null)
  const [rules, setRules] = useState<Rules | null>(null)
  const [store, setStore] = useState<TileStore | null>(null)
  const [version, setVersion] = useState(0)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [foco, setFoco] = useState<{ r: number; c: number } | null>(null)
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null)
  const [buscandoGrupo, setBuscandoGrupo] = useState(false)
  const [mensaje, setMensaje] = useState<{ tono: 'ok' | 'error' | 'aviso'; texto: string } | null>(null)
  const [completado, setCompletado] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  const [hoverCaja, setHoverCaja] = useState<Bin | null>(null)
  const [posDrag, setPosDrag] = useState({ x: 0, y: 0 })

  const contenedorRef = useRef<HTMLDivElement | null>(null)
  const urlPosRef = useRef<{ r: number; c: number } | null>(null)
  const seqSeleccionRef = useRef(0)
  const dragRef = useRef<{ x: number; y: number } | null>(null)

  const piso = usePiso(Number.isInteger(fileId) && fileId > 0 ? fileId : 0, me?.id ?? null, archivo !== null && rules !== null)

  const alAplicar = useCallback(
    (exito: { bin: Bin; cells: Celda[]; progreso: Progress; completado: boolean }) => {
      store?.aplicarBin(exito.cells, letraDeBin(exito.bin))
      setArchivo((actual) => {
        if (actual === null) {
          return actual
        }
        return {
          ...actual,
          progress: exito.progreso,
          status: exito.completado ? 'COMPLETE' : actual.status,
          refinedGroups: exito.completado ? actual.totalGroups : actual.refinedGroups + 1,
        }
      })
      if (exito.completado) {
        setCompletado(true)
      }
      piso.cancelarReserva()
      setSeleccion(null)
    },
    [store, piso],
  )

  const { refinar, refinando } = useRefinar(fileId, store as TileStore, alAplicar)

  useEffect(() => {
    if (!Number.isInteger(fileId) || fileId <= 0) {
      setErrorCarga('El archivo no existe.')
      return
    }
    const controller = new AbortController()
    setErrorCarga(null)
    setArchivo(null)
    setRules(null)
    setSeleccion(null)
    setCompletado(false)
    Promise.all([fetchFile(fileId, controller.signal), fetchRules(fileId, controller.signal)])
      .then(([file, reglas]) => {
        setArchivo(file)
        setRules(reglas)
        if (file.status === 'COMPLETE') {
          setCompletado(true)
        }
        setStore(new TileStore(fileId, file.rows, file.cols, file.tileSize))
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          return
        }
        setErrorCarga(err instanceof ApiError ? err.message : 'No se pudo cargar el archivo.')
      })
    return () => {
      controller.abort()
    }
  }, [fileId])

  useEffect(() => {
    if (store === null) {
      return
    }
    return store.onChange(() => setVersion((v) => v + 1))
  }, [store])

  useEffect(() => {
    const inicialR = Number(params.get('r'))
    const inicialC = Number(params.get('c'))
    if (store !== null && Number.isInteger(inicialR) && Number.isInteger(inicialC) && inicialR >= 0 && inicialC >= 0) {
      const r = Math.min(inicialR, store.totalFilas - 1)
      const c = Math.min(inicialC, store.totalColumnas - 1)
      irA(contenedorRef.current, r, c)
    }
  }, [store])

  const onScrollVisible = useCallback(
    (r: number, c: number) => {
      const previo = urlPosRef.current
      if (previo !== null && previo.r === r && previo.c === c) {
        return
      }
      urlPosRef.current = { r, c }
      const siguiente = new URLSearchParams(params)
      siguiente.set('r', String(r))
      siguiente.set('c', String(c))
      setParams(siguiente, { replace: true })
    },
    [params, setParams],
  )

  const reservasDeOtros = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const reserva of piso.reservas) {
      if (reserva.userId === me?.id) {
        continue
      }
      for (const celda of reserva.cells) {
        mapa.set(`${celda.r}:${celda.c}`, reserva.displayName)
      }
    }
    return mapa
  }, [piso.reservas, me?.id])

  const cursores: CursorOverlay[] = useMemo(() => {
    return piso.presentes
      .filter((p) => p.userId !== me?.id)
      .map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        r: p.r,
        c: p.c,
        color: COLORES[p.userId % COLORES.length],
      }))
  }, [piso.presentes, me?.id])

  const elegirCelda = useCallback(
    async (r: number, c: number) => {
      if (store === null || rules === null || archivo === null || archivo.status === 'COMPLETE') {
        return
      }
      const seq = ++seqSeleccionRef.current
      setMensaje(null)
      const yaSeleccionada = seleccion?.conjunto.has(`${r}:${c}`) ?? false
      if (yaSeleccionada) {
        piso.cancelarReserva()
        setSeleccion(null)
        return
      }
      const bin = store.binEn(r, c)
      if (bin !== null) {
        setSeleccion(null)
        setMensaje({ tono: 'aviso', texto: 'Esa celda ya está refinada.' })
        return
      }
      setBuscandoGrupo(true)
      setSeleccion(null)
      try {
        const grupo = await store.grupoDe(r, c, rules)
        if (seq !== seqSeleccionRef.current) {
          return
        }
        setBuscandoGrupo(false)
        if (grupo === null) {
          setMensaje({ tono: 'aviso', texto: 'Esa celda no da miedo.' })
          return
        }
        const esperada =
          grupo.size < rules.minGroupSize || grupo.size > rules.maxGroupSize
            ? null
            : (() => {
                let indice: number
                if (rules.binning.strategy === 'DIGIT_SUM_MOD') {
                  indice = grupo.valores.reduce((a, b) => a + b, 0) % 4
                } else {
                  indice = Math.max(...grupo.valores) % 4
                }
                return rules.binning.order[indice]
              })()
        const reservadaPor = reservasDeOtros.get(`${r}:${c}`) ?? null
        setSeleccion({
          cells: grupo.cells,
          conjunto: new Set(grupo.cells.map((celda) => `${celda.r}:${celda.c}`)),
          size: grupo.size,
          esperada,
          ruido: esperada === null,
          reservadaPor,
        })
        if (reservadaPor === null) {
          piso.pedirReserva(r, c)
        }
      } catch {
        if (seq === seqSeleccionRef.current) {
          setBuscandoGrupo(false)
          setMensaje({ tono: 'error', texto: 'No se pudo cargar el grupo completo.' })
        }
      }
    },
    [store, rules, archivo, seleccion, piso, reservasDeOtros],
  )

  const soltarEnCaja = useCallback(
    async (bin: Bin) => {
      if (seleccion === null || refinando) {
        return
      }
      if (seleccion.ruido) {
        setMensaje({ tono: 'aviso', texto: 'Ese grupo es ruido: no se puede refinar.' })
        return
      }
      if (seleccion.reservadaPor !== null) {
        setMensaje({
          tono: 'aviso',
          texto: `Ese grupo lo tiene reservado ${seleccion.reservadaPor}.`,
        })
        return
      }
      const resultado = await refinar(seleccion.cells, bin)
      if (resultado.tipo === 'exito') {
        setMensaje({ tono: 'ok', texto: resultado.texto })
      } else {
        setMensaje({ tono: 'error', texto: resultado.texto })
      }
    },
    [seleccion, refinando, refinar],
  )

  useEffect(() => {
    return subscribe((ev) => {
      if (ev.event === 'stream.reset') {
        store?.cancelarTodo()
        setVersion((v) => v + 1)
        setSeleccion(null)
        setMensaje({ tono: 'aviso', texto: 'El flujo de eventos se reinició: recargamos el archivo por si algo cambió.' })
        fetchFile(fileId)
          .then((file) => {
            setArchivo(file)
            setCompletado(file.status === 'COMPLETE')
          })
          .catch(() => {})
        return
      }
      if (ev.event === 'refinement.created') {
        const data = ev.data as {
          fileId?: number
          cells?: Celda[]
          bin?: string
          progress?: Progress
          refinedBy?: { userId?: number }
        } | null
        if (data?.fileId !== fileId || data.cells === undefined) {
          return
        }
        if (data.refinedBy?.userId === me?.id) {
          return
        }
        store?.aplicarBin(data.cells, letraDeBin(data.bin ?? 'WO'))
        if (data.progress !== undefined) {
          setArchivo((actual) => (actual === null ? actual : { ...actual, progress: data.progress as Progress }))
        }
      }
      if (ev.event === 'file.completed') {
        const data = ev.data as { fileId?: number } | null
        if (data?.fileId === fileId) {
          setCompletado(true)
          setArchivo((actual) =>
            actual === null
              ? actual
              : { ...actual, status: 'COMPLETE', progress: { ...actual.progress, overall: 1 } },
          )
        }
      }
    })
  }, [subscribe, fileId, store, me?.id])

  useEffect(() => {
    const onMove = (ev: PointerEvent) => {
      if (dragRef.current === null) {
        return
      }
      setPosDrag({ x: ev.clientX, y: ev.clientY })
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      const caja = el?.closest('[data-bin]')?.getAttribute('data-bin') ?? null
      setHoverCaja(caja !== null && seleccion !== null && !seleccion.ruido && seleccion.reservadaPor === null ? (caja as Bin) : null)
    }
    const onUp = (ev: PointerEvent) => {
      if (dragRef.current === null) {
        return
      }
      dragRef.current = null
      setArrastrando(false)
      const caja = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-bin]')?.getAttribute('data-bin')
      setHoverCaja(null)
      if (caja !== null && seleccion !== null && !seleccion.ruido && seleccion.reservadaPor === null) {
        void soltarEnCaja(caja as Bin)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [seleccion, soltarEnCaja])

  const onPointerMoveGrilla = (ev: React.PointerEvent<HTMLDivElement>) => {
    const el = contenedorRef.current
    if (el === null || archivo === null) {
      return
    }
    const rect = el.getBoundingClientRect()
    const r = Math.floor((ev.clientY - rect.top + el.scrollTop) / DIMENSIONES.ALTO_CELDA)
    const c = Math.floor((ev.clientX - rect.left + el.scrollLeft) / DIMENSIONES.ANCHO_CELDA)
    if (r >= 0 && c >= 0 && r < archivo.rows && c < archivo.cols) {
      piso.enviarCursor(r, c)
    }
  }

  const onPointerDownGrilla = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (seleccion === null || seleccion.ruido || seleccion.reservadaPor !== null || refinando) {
      return
    }
    const objetivo = ev.target as HTMLElement
    const celda = objetivo.closest('[data-c]')
    if (celda === null) {
      return
    }
    const rStr = objetivo.closest('[data-r]')?.getAttribute('data-r')
    const cStr = celda.getAttribute('data-c')
    if (rStr === null || cStr === null) {
      return
    }
    const clave = `${Number(rStr)}:${Number(cStr)}`
    if (!seleccion.conjunto.has(clave)) {
      return
    }
    dragRef.current = { x: ev.clientX, y: ev.clientY }
    setPosDrag({ x: ev.clientX, y: ev.clientY })
    setArrastrando(true)
  }

  const onTeclaCaja = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    if (seleccion === null || refinando) {
      return
    }
    const mapa: Record<string, Bin> = { '1': 'WO', '2': 'FC', '3': 'DR', '4': 'MA', w: 'WO', f: 'FC', d: 'DR', m: 'MA' }
    const bin = mapa[ev.key.toLowerCase()]
    if (bin !== undefined) {
      ev.preventDefault()
      void soltarEnCaja(bin)
    }
  }

  const irAPosicion = (presente: { r: number | null; c: number | null }) => {
    if (presente.r !== null && presente.c !== null) {
      irA(contenedorRef.current, presente.r, presente.c)
    }
  }

  const elegirCeldaRef = useRef(elegirCelda)
  elegirCeldaRef.current = elegirCelda
  const elegirCeldaEstable = useCallback((r: number, c: number) => {
    elegirCeldaRef.current(r, c)
  }, [])

  const onScrollVisibleRef = useRef(onScrollVisible)
  onScrollVisibleRef.current = onScrollVisible
  const onScrollVisibleEstable = useCallback((r: number, c: number) => {
    onScrollVisibleRef.current(r, c)
  }, [])

  const registrarContenedor = useCallback((el: HTMLDivElement | null) => {
    contenedorRef.current = el
  }, [])

  const celdasSeleccion = useMemo(() => seleccion?.conjunto ?? new Set<string>(), [seleccion])

  const onMoverFoco = useCallback((r: number, c: number) => {
    setFoco({ r, c })
  }, [])

  if (errorCarga !== null) {
    return (
      <div className="grid gap-3">
        <p role="alert" className="rounded-md border border-red-700/60 bg-red-900/30 px-4 py-3 text-sm text-red-200">
          {errorCarga}
        </p>
        <Link to="/files" className="text-emerald-300 hover:underline">
          ← Volver a los archivos
        </Link>
      </div>
    )
  }

  if (completado && archivo !== null) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-3xl font-bold text-emerald-200">Archivo completado</h1>
        <p className="max-w-md text-slate-300">
          {archivo.name} llegó al 100 % con {archivo.mistakes} error{archivo.mistakes === 1 ? '' : 'es'} de
          refinamiento. Bien hecho, refinador.
        </p>
        <Link
          to="/files"
          className="rounded-md bg-emerald-500 px-4 py-2 font-semibold text-slate-900 hover:bg-emerald-400"
        >
          Volver a los archivos
        </Link>
      </div>
    )
  }

  return (
    <div className="grid gap-4" onKeyDown={onTeclaCaja}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-emerald-100">{archivo?.name ?? 'Cargando…'}</h1>
          {archivo !== null && (
            <p className="text-sm text-slate-400">
              {archivo.rows}×{archivo.cols} · {Math.round(archivo.progress.overall * 100)}% refinado ·{' '}
              {archivo.refinedGroups}/{archivo.totalGroups} grupos · {archivo.mistakes} errores
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span
            className={`rounded-full px-3 py-1 font-medium ${
              piso.estado === 'conectado'
                ? 'bg-emerald-900/60 text-emerald-300'
                : piso.estado === 'conectando' || piso.estado === 'reconectando'
                  ? 'bg-amber-900/50 text-amber-300'
                  : 'bg-slate-800 text-slate-400'
            }`}
          >
            {piso.estado === 'conectado'
              ? 'Piso conectado'
              : piso.estado === 'conectando'
                ? 'Piso conectando…'
                : piso.estado === 'reconectando'
                  ? 'Piso reconectando…'
                  : 'Piso desconectado'}
          </span>
          <Link to="/files" className="text-slate-300 hover:text-emerald-300">
            ← Archivos
          </Link>
        </div>
      </div>

      {piso.mensajeCierre !== null && (
        <p role="status" className="rounded-md border border-amber-600/50 bg-amber-900/30 px-3 py-2 text-sm text-amber-200">
          {piso.mensajeCierre} Puedes seguir refinando con normalidad.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div>
          {store !== null && rules !== null && archivo !== null ? (
            <div className="relative" onPointerDown={onPointerDownGrilla} onPointerMove={onPointerMoveGrilla}>
              <GrillaVirtual
                store={store}
                filas={archivo.rows}
                columnas={archivo.cols}
                version={version}
                umbral={rules.tremorThreshold}
                celdasSeleccion={celdasSeleccion}
                reservasDeOtros={reservasDeOtros}
                foco={foco}
                onCelda={elegirCeldaEstable}
                onMoverFoco={onMoverFoco}
                onScrollVisible={onScrollVisibleEstable}
                registrarContenedor={registrarContenedor}
              />
              <OverlayCursores contenedor={contenedorRef} cursores={cursores} />
            </div>
          ) : (
            <div className="h-[70vh] w-full animate-pulse rounded-lg border border-slate-700 bg-slate-800/40" />
          )}

          {buscandoGrupo && (
            <p role="status" className="mt-2 text-sm text-amber-200">
              Buscando el grupo completo (puede pedir bloques extra)…
            </p>
          )}

          {mensaje !== null && (
            <p
              role="status"
              className={`mt-2 rounded-md border px-3 py-2 text-sm ${
                mensaje.tono === 'ok'
                  ? 'border-emerald-600/50 bg-emerald-900/30 text-emerald-200'
                  : mensaje.tono === 'aviso'
                    ? 'border-amber-600/50 bg-amber-900/30 text-amber-200'
                    : 'border-red-700/60 bg-red-900/30 text-red-200'
              }`}
            >
              {mensaje.texto}
            </p>
          )}

          {seleccion !== null && (
            <p className="mt-2 text-sm text-slate-300">
              Grupo seleccionado: {seleccion.size} celda{seleccion.size === 1 ? '' : 's'} ·{' '}
              {seleccion.ruido
                ? 'es ruido (fuera del rango de tamaño)'
                : seleccion.reservadaPor !== null
                  ? `reservado por ${seleccion.reservadaPor}`
                  : `caja que corresponde: ${seleccion.esperada}`}
            </p>
          )}
        </div>

        <aside className="grid gap-4">
          <section className="rounded-lg border border-slate-700 bg-slate-800/40 p-3">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">En el piso</h2>
            {piso.presentes.length === 0 && <p className="text-sm text-slate-500">Nadie más conectado.</p>}
            <ul className="grid gap-1">
              {piso.presentes
                .filter((p) => p.userId !== me?.id)
                .map((p) => {
                  const enVista = p.r !== null && p.c !== null
                  return (
                    <li key={p.userId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-slate-200">
                        <span
                          aria-hidden="true"
                          className="mr-1 inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: COLORES[p.userId % COLORES.length] }}
                        />
                        {p.displayName}
                      </span>
                      {enVista ? (
                        <button
                          type="button"
                          onClick={() => irAPosicion(p)}
                          className="shrink-0 rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-700"
                        >
                          Ir
                        </button>
                      ) : (
                        <span className="shrink-0 text-xs text-slate-500">sin cursor</span>
                      )}
                    </li>
                  )
                })}
            </ul>
          </section>

          <section className="rounded-lg border border-slate-700 bg-slate-800/40 p-3 text-sm text-slate-300">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Reglas</h2>
            {rules !== null && (
              <ul className="grid gap-1">
                <li>Umbral de temblor: {rules.tremorThreshold}</li>
                <li>Conectividad: {rules.connectivity}</li>
                <li>Tamaño de grupo: {rules.minGroupSize}–{rules.maxGroupSize}</li>
                <li>
                  Cajas: {rules.binning.strategy === 'DIGIT_SUM_MOD' ? 'suma de dígitos' : 'dígito máximo'} % 4 →{' '}
                  {rules.binning.order.join(', ')}
                </li>
              </ul>
            )}
          </section>
        </aside>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Cajas</h2>
        <Cajas
          progreso={archivo?.progress ?? null}
          esperada={seleccion?.esperada ?? null}
          puedeSoltar={seleccion !== null && !seleccion.ruido && seleccion.reservadaPor === null && !refinando}
          hover={hoverCaja}
          onSoltar={(bin) => void soltarEnCaja(bin)}
        />
      </div>

      {arrastrando && (
        <div
          className="pointer-events-none fixed z-50 rounded-md border border-amber-300 bg-slate-900/90 px-3 py-1.5 text-sm font-semibold text-amber-200 shadow-lg"
          style={{ left: posDrag.x + 12, top: posDrag.y + 12 }}
        >
          {seleccion?.size ?? 1} celda{(seleccion?.size ?? 1) === 1 ? '' : 's'} → suelta en una caja
        </div>
      )}
    </div>
  )
}
