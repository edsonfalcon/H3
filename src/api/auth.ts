import { request } from './http'
import { LoginResponseSchema, RegisterResponseSchema, MeSchema } from './schemas'
import { setTokens } from '../auth/tokens'

export async function login(email: string, password: string) {
  const data = await request(
    '/auth/login',
    LoginResponseSchema,
    { method: 'POST', body: { email, password }, auth: false },
  )
  setTokens(data)
  return data
}

export async function register(teamName: string, email: string, password: string) {
  const data = await request(
    '/auth/register',
    RegisterResponseSchema,
    { method: 'POST', body: { teamName, email, password }, auth: false },
  )
  setTokens(data)
  return data
}

export async function fetchMe() {
  return request('/auth/me', MeSchema)
}

export { fetchMe as me }
