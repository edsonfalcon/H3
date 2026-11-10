import type { Progress } from '../../api/schemas'

export type Bin = 'WO' | 'FC' | 'DR' | 'MA'

const DEFINICION: Array<{ bin: Bin; nombre: string; detalle: string }> = [
  { bin: 'WO', nombre: 'WO', detalle: 'Woe' },
  { bin: 'FC', nombre: 'FC', detalle: 'Frolic' },
  { bin: 'DR', nombre: 'DR', detalle: 'Dread' },
  { bin: 'MA', nombre: 'MA', detalle: 'Malice' },
]

interface PropsCajas {
  progreso: Progress | null
  esperada: Bin | null
  puedeSoltar: boolean
  hover: Bin | null
  onSoltar: (bin: Bin) => void
}

export function Cajas({ progreso, esperada, puedeSoltar, hover, onSoltar }: PropsCajas) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {DEFINICION.map(({ bin, nombre, detalle }, i) => {
        const valor = progreso?.[bin] ?? 0
        const esHover = hover === bin
        return (
          <div
            key={bin}
            data-bin={bin}
            className={`rounded-lg border p-3 transition-colors ${
              esHover
                ? 'scale-[1.02] border-amber-300 bg-amber-500/20'
                : puedeSoltar
                  ? 'border-emerald-500/50 bg-slate-800/60'
                  : 'border-slate-700 bg-slate-800/40'
            }`}
          >
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-lg font-bold text-emerald-100">{nombre}</span>
              <span className="text-xs text-slate-400">{detalle}</span>
            </div>
            <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-slate-700">
              <div
                className="h-full rounded-full bg-emerald-400 transition-[width] duration-300"
                style={{ width: `${Math.round(valor * 100)}%` }}
              />
            </div>
            <p className="mb-2 text-right text-xs text-slate-300">{Math.round(valor * 100)}%</p>
            <button
              type="button"
              disabled={!puedeSoltar}
              onClick={() => onSoltar(bin)}
              className="w-full rounded-md border border-slate-600 px-3 py-1.5 text-sm font-semibold text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Llevar a {nombre}
              <span aria-hidden="true" className="ml-1 text-slate-500">
                ({i + 1})
              </span>
            </button>
            {esperada === bin && puedeSoltar && (
              <p className="mt-1 text-center text-xs font-medium text-emerald-300">Caja correcta</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
