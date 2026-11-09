import { request } from './http'
import { MemberSchema, RoleSchema, RosterSchema } from './schemas'

export function fetchRoles() {
  return request('/team/roles', RoleSchema.array())
}

export function fetchMembers() {
  return request('/team/members', MemberSchema.array())
}

export function createMember(input: { email: string; displayName: string; password: string; roleId: number }) {
  return request('/team/members', MemberSchema, { method: 'POST', body: input })
}

export function fetchRoster() {
  return request('/team/roster', RosterSchema)
}

export function saveRoster(members: Array<{ name: string; code: string }>) {
  return request('/team/roster', RosterSchema, { method: 'PUT', body: { members } })
}
