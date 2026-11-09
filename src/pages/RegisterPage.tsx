import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSession } from '../auth/SessionContext'
import { ApiError } from '../api/http'

export default function RegisterPage() {
  const { register } = useSession()
  const navigate = useNavigate()

  const [teamName, setTeamName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFieldErrors({})
    if (password !== confirm) {
      setFieldErrors({ confirm: 'Las contraseñas no coinciden.' })
      return
    }
    setLoading(true)
    setError(null)
    try {
      await register(teamName, email, password)
      navigate('/files', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
        if (err.code === 'VALIDATION_ERROR') {
          const details = err.details as { fields?: Record<string, string> } | null
          if (details?.fields !== undefined) {
            setFieldErrors(details.fields)
          }
        } else if (err.code.includes('EMAIL')) {
          setFieldErrors({ email: err.message })
        } else if (err.code.includes('TEAM')) {
          setFieldErrors({ teamName: err.message })
        }
      } else {
        setError('No se pudo registrar la cuadrilla.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900/70 p-6 shadow-lg">
        <h1 className="mb-1 text-2xl font-semibold text-emerald-100">Registrar cuadrilla</h1>
        <p className="mb-4 text-sm text-slate-400">Una cuenta por equipo. Los demás integrantes entran con estos datos.</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label htmlFor="reg-team" className="mb-1 block text-sm font-medium text-slate-200">
              Nombre de la cuadrilla
            </label>
            <input
              id="reg-team"
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              required
              minLength={3}
              maxLength={40}
              className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 focus:border-emerald-400"
              placeholder="Cuadrilla Cold Harbor"
            />
            {fieldErrors.teamName !== undefined && (
              <p className="mt-1 text-sm text-red-300">{fieldErrors.teamName}</p>
            )}
          </div>

          <div className="mb-4">
            <label htmlFor="reg-email" className="mb-1 block text-sm font-medium text-slate-200">
              Correo
            </label>
            <input
              id="reg-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={120}
              className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 focus:border-emerald-400"
              placeholder="correo@utec.edu.pe"
            />
            {fieldErrors.email !== undefined && (
              <p className="mt-1 text-sm text-red-300">{fieldErrors.email}</p>
            )}
          </div>

          <div className="mb-4">
            <label htmlFor="reg-password" className="mb-1 block text-sm font-medium text-slate-200">
              Contraseña
            </label>
            <input
              id="reg-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 focus:border-emerald-400"
            />
            {fieldErrors.password !== undefined && (
              <p className="mt-1 text-sm text-red-300">{fieldErrors.password}</p>
            )}
          </div>

          <div className="mb-4">
            <label htmlFor="reg-confirm" className="mb-1 block text-sm font-medium text-slate-200">
              Confirmar contraseña
            </label>
            <input
              id="reg-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 focus:border-emerald-400"
            />
            {fieldErrors.confirm !== undefined && (
              <p className="mt-1 text-sm text-red-300">{fieldErrors.confirm}</p>
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
            {loading ? 'Registrando…' : 'Crear cuenta y entrar'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-400">
          ¿Ya registraron?{' '}
          <Link to="/login" className="font-medium text-emerald-300 hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
