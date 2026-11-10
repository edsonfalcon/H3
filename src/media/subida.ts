import { requestMediaTicket, confirmMedia } from '../api/lumon'
import { ApiError } from '../api/http'
import type { Media } from '../api/schemas'
import { sha256Hex, type ImagenLista } from './imagen'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

export class SubidaCanceladaError extends Error {
  constructor() {
    super('La subida se canceló.')
  }
}

export type EtapaSubida = 'ticket' | 'subiendo' | 'confirmando'

export interface ControlSubida {
  promesa: Promise<Media>
  cancelar: () => void
}

export function subirImagen(purpose: 'BADGE' | 'INCIDENT', imagen: ImagenLista, alProgreso: (etapa: EtapaSubida, avance: number) => void): ControlSubida {
  let cancelada = false
  let xhr: XMLHttpRequest | null = null

  const promesa = (async (): Promise<Media> => {
    alProgreso('ticket', 0)
    const sha256 = await sha256Hex(imagen.blob)
    if (cancelada) {
      throw new SubidaCanceladaError()
    }
    const ticket = await requestMediaTicket({
      purpose,
      contentType: 'image/webp',
      bytes: imagen.blob.size,
      sha256,
      width: imagen.width,
      height: imagen.height,
    })
    if (cancelada) {
      throw new SubidaCanceladaError()
    }
    if (ticket.provider !== 'SUPABASE' || ticket.objectPath === undefined || ticket.bucket === undefined) {
      throw new ApiError(0, 'STORAGE_NO_SOPORTADO', 'El storage registrado no es Supabase. Registra Supabase en /estado.')
    }
    if (typeof SUPABASE_URL !== 'string' || SUPABASE_URL === '' || typeof SUPABASE_KEY !== 'string' || SUPABASE_KEY === '') {
      throw new ApiError(0, 'CONFIG_INCOMPLETA', 'Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_KEY.')
    }
    const base = SUPABASE_URL.replace(/\/$/, '')
    const ruta = ticket.objectPath.split('/').map(encodeURIComponent).join('/')
    const destino = `${base}/storage/v1/object/${ticket.bucket}/${ruta}`
    await new Promise<void>((resolver, rechazar) => {
      const request = new XMLHttpRequest()
      xhr = request
      request.open('POST', destino)
      request.setRequestHeader('Authorization', `Bearer ${SUPABASE_KEY}`)
      request.setRequestHeader('Content-Type', 'image/webp')
      request.setRequestHeader('x-upsert', 'false')
      request.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          alProgreso('subiendo', ev.loaded / ev.total)
        }
      }
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) {
          resolver()
          return
        }
        rechazar(new ApiError(request.status, 'STORAGE_RECHAZO', `El storage rechazó la subida (${request.status}).`))
      }
      request.onerror = () => {
        rechazar(new ApiError(0, 'STORAGE_RED', 'No se pudo conectar con el storage.'))
      }
      request.onabort = () => {
        rechazar(new SubidaCanceladaError())
      }
      request.send(imagen.blob)
    })
    if (cancelada) {
      throw new SubidaCanceladaError()
    }
    alProgreso('confirmando', 0)
    const urlPublica = `${base}/storage/v1/object/public/${ticket.bucket}/${ruta}`
    return await confirmMedia(ticket.ticketId, urlPublica)
  })()

  return {
    promesa,
    cancelar: () => {
      cancelada = true
      xhr?.abort()
    },
  }
}
