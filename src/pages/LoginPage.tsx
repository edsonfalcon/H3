import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../auth/SessionContext'
import { ApiError } from '../api/http'

export default function LoginPage() {
  const { login, sessionMessage } = useSession()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: string; message?: string } | null }

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const from = location.state?.from ?? '/files'
  const message = location.state?.message ?? sessionMessage

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setFieldErrors({})
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
        if (err.code === 'VALIDATION_ERROR') {
          const details = err.details as { fields?: Record<string, string> } | null
          if (details?.fields !== undefined) {
            setFieldErrors(details.fields)
          }
        }
      } else {
        setError('No se pudo iniciar sesión.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900/70 p-6 shadow-lg">
        <h1 className="mb-1 text-2xl font-semibold text-emerald-100">Ingresar al piso</h1>
        <p className="mb-4 text-sm text-slate-400">Consola de Macrodata Refinement</p>

        {message !== null && message !== '' && (
          <p role="status" className="mb-4 rounded-md border border-amber-600/50 bg-amber-900/30 px-3 py-2 text-sm text-amber-200">
            {message}
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-slate-200">
              Correo
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-emerald-400"
              placeholder="correo@utec.edu.pe"
            />
            {fieldErrors.email !== undefined && (
              <p className="mt-1 text-sm text-red-300">{fieldErrors.email}</p>
            )}
          </div>

          <div className="mb-4">
            <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-slate-200">
              Contraseña
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 focus:border-emerald-400"
            />
            {fieldErrors.password !== undefined && (
              <p className="mt-1 text-sm text-red-300">{fieldErrors.password}</p>
            )}
          </div>

          {error !== null && (
            <p role="alert" className="mb-4 rounded-md border border-red-700/60 bg-red-900/30 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-emerald-500 px-4 py-2 font-semibold text-slate-900 hover:bg-emerald-400 disabled:opacity-60"
          >
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-400">
          ¿Primera vez?{' '}
          <Link to="/registro" className="font-medium text-emerald-300 hover:underline">
            Registra tu cuadrilla
          </Link>
        </p>
      </div>
    </div>
  )
}
