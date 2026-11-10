export interface ImagenLista {
  blob: Blob
  width: number
  height: number
}

const CALIDADES = [0.92, 0.85, 0.78, 0.7, 0.62, 0.54, 0.46, 0.38, 0.3]

export class NavegadorSinWebpError extends Error {
  constructor() {
    super('Este navegador no puede generar imágenes WebP. Usa Chrome, Edge o Firefox actualizado.')
  }
}

export class PesoMaximoError extends Error {
  constructor(maxBytes: number) {
    super(
      `No se pudo generar un WebP dentro del peso máximo (${Math.round(maxBytes / 1024)} KB). Prueba con una foto más simple.`,
    )
  }
}

export async function cargarBitmap(archivo: File | Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(archivo, { imageOrientation: 'from-image' })
  } catch {
    return await createImageBitmap(archivo)
  }
}

function aCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('No se pudo crear el lienzo para procesar la imagen.')
  }
  return { canvas, ctx }
}

async function canvasAWebp(canvas: HTMLCanvasElement, maxBytes: number): Promise<Blob> {
  let primero: Blob | null = null
  for (const calidad of CALIDADES) {
    const blob = await new Promise<Blob | null>((resolver) => canvas.toBlob(resolver, 'image/webp', calidad))
    if (blob === null) {
      continue
    }
    if (primero === null) {
      primero = blob
    }
    if (blob.type !== 'image/webp') {
      throw new NavegadorSinWebpError()
    }
    if (blob.size <= maxBytes) {
      return blob
    }
  }
  if (primero !== null && primero.type !== 'image/webp') {
    throw new NavegadorSinWebpError()
  }
  throw new PesoMaximoError(maxBytes)
}

export async function recorteCuadrado(
  bitmap: ImageBitmap,
  x: number,
  y: number,
  lado: number,
  tamano: number,
  maxBytes: number,
): Promise<ImagenLista> {
  const { canvas, ctx } = aCanvas(tamano, tamano)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, x, y, lado, lado, 0, 0, tamano, tamano)
  const blob = await canvasAWebp(canvas, maxBytes)
  return { blob, width: tamano, height: tamano }
}

export async function fotoEscalada(
  bitmap: ImageBitmap,
  minLadoMayor: number,
  maxLadoMayor: number,
  maxBytes: number,
): Promise<ImagenLista> {
  const largo = Math.max(bitmap.width, bitmap.height)
  const objetivo = Math.max(minLadoMayor, Math.min(maxLadoMayor, largo))
  const escala = objetivo / largo
  const width = Math.max(1, Math.round(bitmap.width * escala))
  const height = Math.max(1, Math.round(bitmap.height * escala))
  const { canvas, ctx } = aCanvas(width, height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, width, height)
  const blob = await canvasAWebp(canvas, maxBytes)
  return { blob, width, height }
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
