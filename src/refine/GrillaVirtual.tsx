import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import type { TileStore } from './tileStore'

const ALTO_CELDA = 24
const ANCHO_CELDA = 24
const MAX_CELDAS_DOM = 2500
const MARGEN_FILAS = 3
const MARGEN_COLS = 6

interface PropsCelda {
  digito: number | null
  miedo: boolean
  tremor: number | null
  bin: string | null
  seleccionada: boolean
  reservadaPor: string | null
  esFoco: boolean
  colIndex: number
}

const Celda = memo(function Celda({
  digito,
  miedo,
  tremor,
  bin,
  seleccionada,
  reservadaPor,
  esFoco,
  colIndex,
}: PropsCelda) {
  const estilo: CSSProperties = {
    width: ANCHO_CELDA,
    height: ALTO_CELDA,
    lineHeight: ALTO_CELDA,
  }
  let clases =
    'flex items-center justify-center text-[11px] select-none rounded-[3px] font-mono'
  if (digito === null) {
    clases += ' bg-slate-800/40 text-slate-600'
  } else if (bin !== null) {
    if (bin === 'W') clases += ' bg-emerald-900/70 text-emerald-300'
    else if (bin === 'F') clases += ' bg-sky-900/70 text-sky-300'
    else if (bin === 'D') clases += ' bg-violet-900/70 text-violet-300'
    else clases += ' bg-rose-900/70 text-rose-300'
    clases += ' font-semibold'
  } else if (miedo) {
    const amplitud = tremor !== null ? 0.4 + (tremor / 100) * 1.6 : 1
    const duracion = tremor !== null ? 0.9 - (tremor / 100) * 0.5 : 1
    Object.assign(
      estilo,
      { '--tremor-amp': `${amplitud.toFixed(2)}px`, '--tremor-dur': `${duracion.toFixed(2)}s` } as CSSProperties,
    )
    clases += ' celda-miedo bg-red-950/70 text-red-300'
  } else {
    clases += ' bg-slate-800 text-slate-500'
  }
  if (seleccionada) {
    clases += ' ring-2 ring-amber-300 z-10'
  } else if (reservadaPor !== null) {
    clases += ' ring-2 ring-orange-400/80 z-[5]'
  }
  if (esFoco) {
    clases += ' outline outline-2 outline-emerald-300 z-20'
  }
  return (
    <div
      role="gridcell"
      aria-colindex={colIndex}
      data-c={colIndex - 1}
      className={clases}
      style={estilo}
      title={reservadaPor !== null ? `Reservado por ${reservadaPor}` : undefined}
    >
      {digito ?? '·'}
    </div>
  )
})

export interface EstadoCursor {
  userId: number
  displayName: string
  r: number | null
  c: number | null
  color: string
}

interface PropsGrilla {
  store: TileStore
  filas: number
  columnas: number
  version: number
  umbral: number
  celdasSeleccion: Set<string>
  reservasDeOtros: Map<string, string>
  foco: { r: number; c: number } | null
  onCelda: (r: number, c: number) => void
  onMoverFoco: (r: number, c: number) => void
  onScrollVisible: (r: number, c: number) => void
  registrarContenedor: (el: HTMLDivElement | null) => void
}

export const GrillaVirtual = memo(function GrillaVirtual({
  store,
  filas,
  columnas,
  version,
  umbral,
  celdasSeleccion,
  reservasDeOtros,
  foco,
  onCelda,
  onMoverFoco,
  onScrollVisible,
  registrarContenedor,
}: PropsGrilla) {
  const contenedorRef = useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState({ arriba: 0, izquierda: 0, alto: 600, ancho: 800 })

  const medir = useCallback(() => {
    const el = contenedorRef.current
    if (el === null) {
      return
    }
    const { scrollTop, scrollLeft, clientHeight, clientWidth } = el
    setViewport((previo) =>
      previo.arriba === scrollTop &&
      previo.izquierda === scrollLeft &&
      previo.alto === clientHeight &&
      previo.ancho === clientWidth
        ? previo
        : { arriba: scrollTop, izquierda: scrollLeft, alto: clientHeight, ancho: clientWidth },
    )
  }, [])

  useLayoutEffect(() => {
    medir()
    const el = contenedorRef.current
    if (el === null) {
      return
    }
    const onScroll = () => {
      medir()
      onScrollVisible(Math.floor(el.scrollTop / ALTO_CELDA), Math.floor(el.scrollLeft / ANCHO_CELDA))
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    const observer = new ResizeObserver(medir)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [medir, onScrollVisible])

  const filasVisibles = Math.ceil(viewport.alto / ALTO_CELDA)
  const colsVisibles = Math.ceil(viewport.ancho / ANCHO_CELDA)

  const filaDesde = Math.max(0, Math.floor(viewport.arriba / ALTO_CELDA) - MARGEN_FILAS)
  const filaHastaMax = Math.min(filas - 1, filaDesde + filasVisibles + MARGEN_FILAS * 2)
  const colDesde = Math.max(0, Math.floor(viewport.izquierda / ANCHO_CELDA) - MARGEN_COLS)
  const colHastaMax = Math.min(columnas - 1, colDesde + colsVisibles + MARGEN_COLS * 2)

  let filasADibujar = filaHastaMax - filaDesde + 1
  let colsADibujar = colHastaMax - colDesde + 1
  while (filasADibujar * colsADibujar > MAX_CELDAS_DOM && colsADibujar > 12) {
    colsADibujar -= 1
  }
  while (filasADibujar * colsADibujar > MAX_CELDAS_DOM && filasADibujar > 12) {
    filasADibujar -= 1
  }
  const filaHasta = filaDesde + filasADibujar - 1
  const colHasta = colDesde + colsADibujar - 1

  const teclas = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    if (foco === null) {
      if (['ArrowDown', 'ArrowRight', 'Home', 'PageDown', 'Enter'].includes(ev.key)) {
        onMoverFoco(0, 0)
        ev.preventDefault()
      }
      return
    }
    let { r, c } = foco
    const paso = Math.max(1, Math.floor(filasVisibles / 2))
    switch (ev.key) {
      case 'ArrowUp': r = Math.max(0, r - 1); break
      case 'ArrowDown': r = Math.min(filas - 1, r + 1); break
      case 'ArrowLeft': c = Math.max(0, c - 1); break
      case 'ArrowRight': c = Math.min(columnas - 1, c + 1); break
      case 'PageUp': r = Math.max(0, r - paso); break
      case 'PageDown': r = Math.min(filas - 1, r + paso); break
      case 'Home': c = 0; break
      case 'End': c = columnas - 1; break
      case 'Enter':
      case ' ':
        onCelda(r, c)
        ev.preventDefault()
        return
      default:
        return
    }
    ev.preventDefault()
    onMoverFoco(r, c)
    const el = contenedorRef.current
    if (el !== null) {
      const top = r * ALTO_CELDA
      const left = c * ANCHO_CELDA
      if (top < el.scrollTop) {
        el.scrollTop = top
      } else if (top + ALTO_CELDA > el.scrollTop + el.clientHeight) {
        el.scrollTop = top + ALTO_CELDA - el.clientHeight
      }
      if (left < el.scrollLeft) {
        el.scrollLeft = left
      } else if (left + ANCHO_CELDA > el.scrollLeft + el.clientWidth) {
        el.scrollLeft = left + ANCHO_CELDA - el.clientWidth
      }
    }
  }

  const onClick = (ev: React.MouseEvent<HTMLDivElement>) => {
    const objetivo = ev.target as HTMLElement
    const filaEl = objetivo.closest('[data-r]')
    const colEl = objetivo.closest('[data-c]')
    if (filaEl === null || colEl === null) {
      return
    }
    const r = Number(filaEl.getAttribute('data-r'))
    const c = Number(colEl.getAttribute('data-c'))
    onMoverFoco(r, c)
    onCelda(r, c)
  }

  useEffect(() => {
    const desde = store.tileDe(filaDesde, colDesde)
    const hasta = store.tileDe(filaHasta, colHasta)
    const visibles = new Set<string>()
    for (let tr = desde.tileRow; tr <= hasta.tileRow; tr++) {
      for (let tc = desde.tileCol; tc <= hasta.tileCol; tc++) {
        visibles.add(`${tr}:${tc}`)
        store.cargar(tr, tc).catch(() => {})
      }
    }
    const expandido = new Set<string>()
    const margenTr = 2
    const margenTc = 3
    for (let tr = desde.tileRow - margenTr; tr <= hasta.tileRow + margenTr; tr++) {
      for (let tc = desde.tileCol - margenTc; tc <= hasta.tileCol + margenTc; tc++) {
        expandido.add(`${tr}:${tc}`)
      }
    }
    store.limpiarFueraDeVista(expandido)
  }, [store, filaDesde, filaHasta, colDesde, colHasta])

  const celdasFila = (r: number) => {
    const celdas: ReactNode[] = []
    for (let c = colDesde; c <= colHasta; c++) {
      const clave = `${r}:${c}`
      celdas.push(
        <Celda
          key={c}
          colIndex={c + 1}
          digito={store.valorEn(r, c)}
          miedo={(store.tremorEn(r, c) ?? -1) >= umbral}
          tremor={store.tremorEn(r, c)}
          bin={store.binEn(r, c)}
          seleccionada={celdasSeleccion.has(clave)}
          reservadaPor={reservasDeOtros.get(clave) ?? null}
          esFoco={foco !== null && foco.r === r && foco.c === c}
        />,
      )
    }
    return celdas
  }

  const filasRender = []
  for (let r = filaDesde; r <= filaHasta; r++) {
    filasRender.push(
      <div
        key={r}
        data-r={r}
        role="row"
        aria-rowindex={r + 1}
        className="absolute flex"
        style={{ top: r * ALTO_CELDA, left: colDesde * ANCHO_CELDA }}
      >
        {celdasFila(r)}
      </div>,
    )
  }

  const anchoTotal = columnas * ANCHO_CELDA
  const altoTotal = filas * ALTO_CELDA

  return (
    <div
      ref={(el) => {
        contenedorRef.current = el
        registrarContenedor(el)
      }}
      data-version={version}
      role="grid"
      tabIndex={0}
      aria-label={`Grilla de ${filas} filas por ${columnas} columnas`}
      aria-rowcount={filas}
      aria-colcount={columnas}
      aria-activedescendant={foco !== null ? `celda-${foco.r}-${foco.c}` : undefined}
      onKeyDown={teclas}
      onClick={onClick}
      className="relative h-[70vh] w-full overflow-auto rounded-lg border border-slate-700 bg-slate-900/40"
    >
      <div style={{ position: 'relative', width: anchoTotal, height: altoTotal }}>
        {filasRender}
      </div>
    </div>
  )
})

export function irA(el: HTMLDivElement | null, r: number, c: number): void {
  if (el === null) {
    return
  }
  const top = r * ALTO_CELDA
  const left = c * ANCHO_CELDA
  el.scrollTop = Math.max(0, top - el.clientHeight / 2)
  el.scrollLeft = Math.max(0, left - el.clientWidth / 2)
}

export const DIMENSIONES = { ALTO_CELDA, ANCHO_CELDA }
