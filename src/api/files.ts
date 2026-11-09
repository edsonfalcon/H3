import { request } from './http'
import {
  FilePageSchema,
  FileSchema,
  RulesSchema,
  TileSchema,
  RefineResultSchema,
} from './schemas'
import type { RefineResult } from './schemas'

export interface FileListQuery {
  page: number
  size: number
  status: 'ACTIVE' | 'COMPLETE' | null
  q: string | null
  sort: 'progress,desc' | 'name,asc' | 'updatedAt,desc'
}

export function fetchFiles(query: FileListQuery, signal?: AbortSignal) {
  const params = new URLSearchParams()
  params.set('page', String(query.page))
  params.set('size', String(query.size))
  params.set('sort', query.sort)
  if (query.status !== null) {
    params.set('status', query.status)
  }
  if (query.q !== null && query.q !== '') {
    params.set('q', query.q)
  }
  return request(`/files?${params.toString()}`, FilePageSchema, { signal })
}

export function fetchFile(id: number, signal?: AbortSignal) {
  return request(`/files/${id}`, FileSchema, { signal })
}

export function fetchRules(id: number, signal?: AbortSignal) {
  return request(`/files/${id}/rules`, RulesSchema, { signal })
}

export function fetchTile(fileId: number, tileRow: number, tileCol: number, signal?: AbortSignal) {
  return request(
    `/files/${fileId}/tiles/${tileRow}/${tileCol}`,
    TileSchema,
    { signal, retries: 0 },
  )
}

export function refineGroup(
  fileId: number,
  idempotencyKey: string,
  bin: 'WO' | 'FC' | 'DR' | 'MA',
  cells: Array<{ r: number; c: number }>,
): Promise<RefineResult> {
  return request(
    `/files/${fileId}/refinements`,
    RefineResultSchema,
    {
      method: 'POST',
      body: { bin, cells },
      headers: { 'Idempotency-Key': idempotencyKey },
      retries: 2,
    },
  )
}
