import { request, requestWithMeta, ApiError } from './http'
import { z } from 'zod'
import {
  DepartmentSchema,
  RefinerPageSchema,
  RefinerSchema,
  MediaTicketSchema,
  MediaSchema,
  IncidentPageSchema,
  IncidentSchema,
  ClearanceSchema,
  ClearanceCheckResultSchema,
  IntegrationStatusSchema,
  DeployChallengeSchema,
  DeployVerifiedSchema,
  StorageResultSchema,
  StreamTicketSchema,
  FloorTicketSchema,
} from './schemas'
import type { Refiner } from './schemas'

const VoidSchema = z.void()

export function fetchDepartments(signal?: AbortSignal) {
  return request('/departments', DepartmentSchema.array(), { signal })
}

export interface RefinerListQuery {
  page: number
  size: number
  departmentId: number | null
  q: string | null
}

export function fetchRefiners(query: RefinerListQuery, signal?: AbortSignal) {
  const params = new URLSearchParams()
  params.set('page', String(query.page))
  params.set('size', String(query.size))
  if (query.departmentId !== null) {
    params.set('departmentId', String(query.departmentId))
  }
  if (query.q !== null && query.q !== '') {
    params.set('q', query.q)
  }
  return request(`/refiners?${params.toString()}`, RefinerPageSchema, { signal })
}

export function fetchRefiner(id: number, signal?: AbortSignal): Promise<{ refiner: Refiner; etag: string | null }> {
  return requestWithMeta(`/refiners/${id}`, RefinerSchema, { signal }).then(({ data, meta }) => ({
    refiner: data,
    etag: meta.etag,
  }))
}

export function patchRefiner(
  id: number,
  etag: string,
  patch: { title?: string; extension?: string; bio?: string; departmentId?: number; badgeMediaId?: number | null },
): Promise<{ refiner: Refiner; etag: string | null }> {
  return requestWithMeta(`/refiners/${id}`, RefinerSchema, {
    method: 'PATCH',
    body: patch,
    headers: { 'If-Match': etag },
    retries: 0,
  }).then(({ data, meta }) => ({ refiner: data, etag: meta.etag }))
}

export function requestMediaTicket(input: {
  purpose: 'BADGE' | 'INCIDENT'
  contentType: string
  bytes: number
  sha256: string
  width: number
  height: number
}) {
  return request('/media/tickets', MediaTicketSchema, { method: 'POST', body: input, retries: 0 })
}

export function confirmMedia(ticketId: string, url: string) {
  return request(`/media/tickets/${ticketId}/confirm`, MediaSchema, {
    method: 'POST',
    body: { url },
    retries: 0,
  })
}

export function fetchIncidents(page: number, size: number, signal?: AbortSignal) {
  return request(`/incidents?page=${page}&size=${size}`, IncidentPageSchema, { signal })
}

export function createIncident(input: {
  title: string
  description: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  fileId: number | null
  mediaIds: number[]
}) {
  return request('/incidents', IncidentSchema, { method: 'POST', body: input, retries: 0 })
}

export function fetchClearance() {
  return request('/clearance', ClearanceSchema)
}

export function runClearanceCheck() {
  return request('/clearance/check', ClearanceCheckResultSchema, { method: 'POST' })
}

export function fetchIntegrationStatus() {
  return request('/integrations/status', IntegrationStatusSchema)
}

export function requestDeployChallenge(origin: string) {
  return request('/integrations/deploy/challenge', DeployChallengeSchema, {
    method: 'POST',
    body: { origin },
    retries: 0,
  })
}

export function verifyDeploy(origin: string) {
  return request('/integrations/deploy/verify', DeployVerifiedSchema, {
    method: 'POST',
    body: { origin },
    retries: 0,
  })
}

export function registerStorage(input: {
  provider: 'SUPABASE'
  projectUrl: string
  bucket: 'lumon-media'
  publicKey: string
}) {
  return request('/integrations/storage', StorageResultSchema, {
    method: 'PUT',
    body: input,
    retries: 0,
  })
}

export function requestStreamTicket() {
  return request('/events/tickets', StreamTicketSchema, { method: 'POST', retries: 0 })
}

export function requestFloorTicket(fileId: number) {
  return request('/floor/tickets', FloorTicketSchema, {
    method: 'POST',
    body: { fileId },
    retries: 0,
  })
}

export function ackContingency(id: number) {
  return request(`/contingency/${id}/ack`, VoidSchema, { method: 'POST', retries: 0 })
}

export { ApiError }
