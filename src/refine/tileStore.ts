import { fetchTile } from '../api/files'
import type { Tile, Rules } from '../api/schemas'
import { ApiError } from '../api/http'

export interface Celda {
  r: number
  c: number
}

export interface Grupo {
  cells: Celda[]
  valores: number[]
  size: number
}

function decodificarBase64(texto: string): Uint8Array {
  const binario = atob(texto)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) {
    bytes[i] = binario.charCodeAt(i)
  }
  return bytes
}

export function cajaPara(rules: Rules, valores: number[]): 'WO' | 'FC' | 'DR' | 'MA' {
  let indice: number
  if (rules.binning.strategy === 'DIGIT_SUM_MOD') {
    let suma = 0
    for (const valor of valores) {
      suma += valor
    }
    indice = suma % 4
  } else {
    let maximo = 0
    for (const valor of valores) {
      if (valor > maximo) {
        maximo = valor
      }
    }
    indice = maximo % 4
  }
  return rules.binning.order[indice]
}

function vecinos(r: number, c: number, conectividad: 4 | 8): Celda[] {
  const lista: Celda[] = [
    { r: r - 1, c },
    { r: r + 1, c },
    { r, c: c - 1 },
    { r, c: c + 1 },
  ]
  if (conectividad === 8) {
    lista.push(
      { r: r - 1, c: c - 1 },
      { r: r - 1, c: c + 1 },
      { r: r + 1, c: c - 1 },
      { r: r + 1, c: c + 1 },
    )
  }
  return lista
}

const MAX_INTENTOS = 6

interface Entrada {
  tile: Tile | null
  promesa: Promise<Tile> | null
  controlador: AbortController | null
  intentos: number
}

export class TileStore {
  private readonly fileId: number
  private readonly filas: number
  private readonly columnas: number
  private readonly tileSize: number
  private readonly entradas = new Map<string, Entrada>()
  private readonly suscriptores = new Set<() => void>()
  private esperaHasta = 0

  constructor(fileId: number, filas: number, columnas: number, tileSize: number) {
    this.fileId = fileId
    this.filas = filas
    this.columnas = columnas
    this.tileSize = tileSize
  }

  get filasTile(): number {
    return Math.ceil(this.filas / this.tileSize)
  }

  get columnasTile(): number {
    return Math.ceil(this.columnas / this.tileSize)
  }

  get totalFilas(): number {
    return this.filas
  }

  get totalColumnas(): number {
    return this.columnas
  }

  tileDe(r: number, c: number): { tileRow: number; tileCol: number } {
    return {
      tileRow: Math.floor(r / this.tileSize),
      tileCol: Math.floor(c / this.tileSize),
    }
  }

  onChange(suscriptor: () => void): () => void {
    this.suscriptores.add(suscriptor)
    return () => {
      this.suscriptores.delete(suscriptor)
    }
  }

  private avisar(): void {
    for (const suscriptor of this.suscriptores) {
      suscriptor()
    }
  }

  obtener(tileRow: number, tileCol: number): Tile | null {
    return this.entradas.get(`${tileRow}:${tileCol}`)?.tile ?? null
  }

  enVuelo(tileRow: number, tileCol: number): boolean {
    const entrada = this.entradas.get(`${tileRow}:${tileCol}`)
    return entrada !== undefined && entrada.promesa !== null
  }

  cargando(): boolean {
    for (const entrada of this.entradas.values()) {
      if (entrada.promesa !== null) {
        return true
      }
    }
    return false
  }

  private async esperarPuerta(signal: AbortSignal): Promise<void> {
    while (Date.now() < this.esperaHasta) {
      const falta = this.esperaHasta - Date.now()
      await new Promise<void>((resolver) => {
        const temporizador = window.setTimeout(resolver, Math.min(falta, 5000))
        const alAbortar = () => {
          window.clearTimeout(temporizador)
          resolver()
        }
        signal.addEventListener('abort', alAbortar, { once: true })
      })
      if (signal.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
    }
  }

  cargar(tileRow: number, tileCol: number): Promise<Tile> {
    const clave = `${tileRow}:${tileCol}`
    const existente = this.entradas.get(clave)
    if (existente !== undefined) {
      if (existente.tile !== null) {
        return Promise.resolve(existente.tile)
      }
      if (existente.promesa !== null) {
        return existente.promesa
      }
    }
    const entrada: Entrada = existente ?? { tile: null, promesa: null, controlador: null, intentos: 0 }
    const controlador = new AbortController()
    entrada.controlador = controlador
    entrada.intentos += 1
    const intento = entrada.intentos

    const promesa = (async () => {
      try {
        await this.esperarPuerta(controlador.signal)
        return await fetchTile(this.fileId, tileRow, tileCol, controlador.signal)
      } catch (err) {
        if (controlador.signal.aborted) {
          this.entradas.delete(clave)
          throw new DOMException('Aborted', 'AbortError')
        }
        if (err instanceof ApiError && (err.status === 429 || err.status === 503) && intento < MAX_INTENTOS) {
          const espera = err.status === 429
            ? (err.retryAfter ?? 1) * 1000
            : Math.min(600 * 2 ** (intento - 1), 8000)
          this.esperaHasta = Math.max(this.esperaHasta, Date.now() + espera)
          entrada.promesa = null
          entrada.intentos = intento
          this.avisar()
          return this.cargar(tileRow, tileCol)
        }
        this.entradas.delete(clave)
        throw err
      } finally {
        if (this.entradas.get(clave) === entrada) {
          entrada.controlador = null
        }
      }
    })()

    entrada.promesa = promesa
    entrada.tile = null
    this.entradas.set(clave, entrada)
    promesa
      .then((tile) => {
        if (this.entradas.get(clave) === entrada) {
          entrada.tile = tile
          entrada.promesa = null
        }
        this.avisar()
      })
      .catch(() => {
        if (this.entradas.get(clave) === entrada) {
          entrada.promesa = null
        }
        this.avisar()
      })
    return promesa
  }

  cancelar(tileRow: number, tileCol: number): void {
    const clave = `${tileRow}:${tileCol}`
    const entrada = this.entradas.get(clave)
    if (entrada === undefined || entrada.tile !== null) {
      return
    }
    entrada.controlador?.abort()
    this.entradas.delete(clave)
  }

  cancelarTodo(): void {
    for (const entrada of this.entradas.values()) {
      entrada.controlador?.abort()
    }
    this.entradas.clear()
  }

  limpiarFueraDeVista(visibles: Set<string>): void {
    for (const clave of this.entradas.keys()) {
      if (!visibles.has(clave)) {
        const entrada = this.entradas.get(clave)
        if (entrada !== undefined && entrada.tile === null) {
          entrada.controlador?.abort()
          this.entradas.delete(clave)
        }
      }
    }
  }

  valorEn(r: number, c: number): number | null {
    const { tileRow, tileCol } = this.tileDe(r, c)
    const tile = this.obtener(tileRow, tileCol)
    if (tile === null) {
      return null
    }
    const local = (r - tile.originRow) * tile.cols + (c - tile.originCol)
    const digito = tile.values.charCodeAt(local) - 48
    return digito >= 0 && digito <= 9 ? digito : null
  }

  tremorEn(r: number, c: number): number | null {
    const { tileRow, tileCol } = this.tileDe(r, c)
    const tile = this.obtener(tileRow, tileCol)
    if (tile === null) {
      return null
    }
    const local = (r - tile.originRow) * tile.cols + (c - tile.originCol)
    const bytes = this.bytesDe(tile)
    return bytes[local] ?? null
  }

  binEn(r: number, c: number): string | null {
    const { tileRow, tileCol } = this.tileDe(r, c)
    const tile = this.obtener(tileRow, tileCol)
    if (tile === null) {
      return null
    }
    const local = (r - tile.originRow) * tile.cols + (c - tile.originCol)
    const ch = tile.bins[local]
    return ch === '.' ? null : ch
  }

  versionDe(tileRow: number, tileCol: number): number | null {
    return this.obtener(tileRow, tileCol)?.version ?? null
  }

  refrescarTiles(pares: Array<[number, number]>): void {
    for (const [tileRow, tileCol] of pares) {
      this.entradas.delete(`${tileRow}:${tileCol}`)
    }
    this.avisar()
  }

  refrescarCeldas(celdas: Array<{ r: number; c: number }>): void {
    const pares = new Set<string>()
    for (const { r, c } of celdas) {
      const { tileRow, tileCol } = this.tileDe(r, c)
      pares.add(`${tileRow}:${tileCol}`)
    }
    for (const clave of pares) {
      this.entradas.delete(clave)
    }
    this.avisar()
  }

  aplicarBin(celdas: Array<{ r: number; c: number }>, letra: 'W' | 'F' | 'D' | 'M'): void {
    const porTile = new Map<string, Array<{ indice: number; letra: string }>>()
    for (const { r, c } of celdas) {
      const { tileRow, tileCol } = this.tileDe(r, c)
      const entrada = this.entradas.get(`${tileRow}:${tileCol}`)
      if (entrada?.tile === null || entrada === undefined || entrada.tile === null) {
        continue
      }
      const tile = entrada.tile
      const indice = (r - tile.originRow) * tile.cols + (c - tile.originCol)
      const lista = porTile.get(`${tileRow}:${tileCol}`) ?? []
      lista.push({ indice, letra })
      porTile.set(`${tileRow}:${tileCol}`, lista)
    }
    for (const [clave, cambios] of porTile) {
      const entrada = this.entradas.get(clave)
      if (entrada === undefined || entrada.tile === null) {
        continue
      }
      const tile = entrada.tile
      const bins = tile.bins.split('')
      for (const { indice, letra: ch } of cambios) {
        bins[indice] = ch
      }
      entrada.tile = { ...tile, bins: bins.join('') }
    }
    this.avisar()
  }

  private bytesCache = new WeakMap<Tile, Uint8Array>()

  private bytesDe(tile: Tile): Uint8Array {
    let bytes = this.bytesCache.get(tile)
    if (bytes === undefined) {
      bytes = decodificarBase64(tile.tremor)
      this.bytesCache.set(tile, bytes)
    }
    return bytes
  }

  async grupoDe(r: number, c: number, rules: Rules): Promise<Grupo | null> {
    const inicial = await this.datoEn(r, c)
    if (inicial === null || !this.daMiedo(r, c, rules)) {
      return null
    }
    const visitadas = new Set<string>()
    const pendientes: Celda[] = [{ r, c }]
    visitadas.add(`${r}:${c}`)
    const cells: Celda[] = []
    while (pendientes.length > 0) {
      const actual = pendientes.pop() as Celda
      const dato = await this.datoEn(actual.r, actual.c)
      if (dato === null || !this.daMiedo(actual.r, actual.c, rules)) {
        continue
      }
      cells.push(actual)
      for (const vecino of vecinos(actual.r, actual.c, rules.connectivity)) {
        const clave = `${vecino.r}:${vecino.c}`
        if (visitadas.has(clave)) {
          continue
        }
        if (vecino.r < 0 || vecino.c < 0 || vecino.r >= this.filas || vecino.c >= this.columnas) {
          continue
        }
        visitadas.add(clave)
        pendientes.push(vecino)
      }
    }
    if (cells.length === 0) {
      return null
    }
    cells.sort((a, b) => a.r - b.r || a.c - b.c)
    const valores = cells.map((celda) => this.valorEn(celda.r, celda.c) ?? 0)
    return { cells, valores, size: cells.length }
  }

  private daMiedo(r: number, c: number, rules: Rules): boolean {
    const tremor = this.tremorEn(r, c)
    return tremor !== null && tremor >= rules.tremorThreshold
  }

  private async datoEn(r: number, c: number): Promise<Tile | null> {
    const { tileRow, tileCol } = this.tileDe(r, c)
    if (this.obtener(tileRow, tileCol) !== null) {
      return this.obtener(tileRow, tileCol)
    }
    try {
      return await this.cargar(tileRow, tileCol)
    } catch {
      return null
    }
  }
}
