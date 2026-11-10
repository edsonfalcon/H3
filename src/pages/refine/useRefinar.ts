import { useCallback, useRef, useState } from 'react'
import { refineGroup } from '../../api/files'
import { ApiError } from '../../api/http'
import type { TileStore, Celda } from '../../refine/tileStore'
import type { Progress } from '../../api/schemas'
import type { Bin } from '../refine/Cajas'

export interface ExitoRefinamiento {
  bin: Bin
  cells: Celda[]
  progreso: Progress
  mistakes: number
  completado: boolean
}

export interface ResultadoRefinar {
  tipo: 'exito' | 'mensaje'
  texto: string
  exito?: ExitoRefinamiento
}

interface Intencion {
  key: string
  cells: Celda[]
  bin: Bin
}

const MAX_REINTENTOS = 5

function generarKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `int-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

export function useRefinar(
  fileId: number,
  store: TileStore,
  alAplicar: (resultado: ExitoRefinamiento) => void,
) {
  const [refinando, setRefinando] = useState(false)
  const intencionRef = useRef<Intencion | null>(null)

  const refinar = useCallback(
    async (cells: Celda[], bin: Bin): Promise<ResultadoRefinar> => {
      const actual = intencionRef.current
      if (actual !== null && actual.bin === bin && actual.cells.length === cells.length) {
        const mismas =
          actual.cells.every((c1) => cells.some((c2) => c2.r === c1.r && c2.c === c1.c)) &&
          cells.every((c2) => actual.cells.some((c1) => c1.r === c2.r && c1.c === c2.c))
        if (!mismas) {
          intencionRef.current = { key: generarKey(), cells, bin }
        }
      } else {
        intencionRef.current = { key: generarKey(), cells, bin }
      }
      const intencion = intencionRef.current as Intencion
      setRefinando(true)

      const esperar = (ms: number) => new Promise<void>((resolver) => window.setTimeout(resolver, ms))

      for (let intento = 0; ; intento++) {
        try {
          const resultado = await refineGroup(fileId, intencion.key, bin, intencion.cells)
          intencionRef.current = null
          const exito: ExitoRefinamiento = {
            bin,
            cells: intencion.cells,
            progreso: resultado.file.progress,
            mistakes: resultado.file.mistakes,
            completado: resultado.file.status === 'COMPLETE',
          }
          const mensaje: ResultadoRefinar = {
            tipo: 'exito',
            texto: `Grupo de ${resultado.size} celda${resultado.size === 1 ? '' : 's'} llevado a ${bin}.`,
            exito,
          }
          alAplicar(exito)
          return mensaje
        } catch (err) {
          if (err instanceof ApiError) {
            if (err.status === 503 || err.status === 0) {
              if (intento >= MAX_REINTENTOS) {
                intencionRef.current = null
                return { tipo: 'mensaje', texto: 'No se pudo completar el refinamiento. Inténtalo de nuevo.' }
              }
              await esperar(Math.max(1, err.retryAfter ?? 1) * 1000)
              continue
            }
            intencionRef.current = null
            if (err.status === 409 && err.code === 'ALREADY_REFINED') {
              const detalles = err.details as { tiles?: Array<[number, number]> } | null
              if (detalles?.tiles !== undefined) {
                store.refrescarTiles(detalles.tiles)
              } else {
                store.refrescarCeldas(intencion.cells)
              }
              return {
                tipo: 'mensaje',
                texto: 'Alguna celda ya estaba refinada. Los bloques se volvieron a pedir: revisa el grupo e inténtalo de nuevo.',
              }
            }
            if (err.status === 409 && err.code === 'GROUP_CLAIMED') {
              const detalles = err.details as { holder?: { displayName?: string } } | null
              const quien = detalles?.holder?.displayName ?? 'otro refinador'
              return { tipo: 'mensaje', texto: `Ese grupo lo tiene reservado ${quien}. Espera a que lo libere.` }
            }
            if (err.status === 422 && err.code === 'WRONG_BIN') {
              return { tipo: 'mensaje', texto: `${err.message} Revisa las reglas y llévalo a la caja correcta.` }
            }
            if (err.status === 422 && err.code === 'GROUP_INVALID') {
              const detalles = err.details as { reason?: string; missing?: number } | null
              const motivo =
                detalles?.reason === 'INCOMPLETE'
                  ? `El grupo está incompleto: faltan ${detalles?.missing ?? '?'} celdas.`
                  : detalles?.reason === 'NOT_CONNECTED'
                    ? 'Las celdas no forman un grupo conexo.'
                    : detalles?.reason === 'SIZE_OUT_OF_RANGE'
                      ? 'El grupo está fuera del rango de tamaño: es ruido.'
                      : detalles?.reason === 'BELOW_THRESHOLD'
                        ? 'Alguna celda del grupo no da miedo.'
                        : err.message
              return { tipo: 'mensaje', texto: motivo }
            }
            return { tipo: 'mensaje', texto: err.message }
          }
          if (intento >= MAX_REINTENTOS) {
            intencionRef.current = null
            return { tipo: 'mensaje', texto: 'No se pudo completar el refinamiento. Inténtalo de nuevo.' }
          }
          await esperar(Math.min(600 * 2 ** intento, 5000))
          continue
        } finally {
          if (intencionRef.current === null) {
            setRefinando(false)
          }
        }
      }
    },
    [fileId, store, alAplicar],
  )

  return { refinar, refinando }
}
