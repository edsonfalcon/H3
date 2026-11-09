import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { request } from '../api/http'
import { HealthSchema } from '../api/schemas'

const DELAYS = [1000, 2000, 4000, 8000, 15000]

export function HealthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'ok'>('checking')
  const [attempts, setAttempts] = useState(0)
  const timer = useRef<number | null>(null)
  const attemptsRef = useRef(0)

  const check = useCallback(() => {
    setState('checking')
    request('/meta/health', HealthSchema, { auth: false, retries: 0 })
      .then(() => setState('ok'))
      .catch(() => {
        attemptsRef.current += 1
        setAttempts(attemptsRef.current)
        const delay = DELAYS[Math.min(attemptsRef.current, DELAYS.length - 1)]
        timer.current = window.setTimeout(check, delay)
      })
  }, [])

  useEffect(() => {
    check()
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
      }
    }
  }, [check])

  const retryNow = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
    }
    attemptsRef.current = 0
    setAttempts(0)
    check()
  }

  if (state === 'ok') {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold text-emerald-100">Conectando con Lumon…</h1>
      <p className="max-w-md text-slate-300">
        No se puede alcanzar la API. Se reintenta automáticamente en{' '}
        {Math.round(DELAYS[Math.min(attempts, DELAYS.length - 1)] / 1000)} segundos.
      </p>
      <button
        type="button"
        onClick={retryNow}
        className="rounded-md bg-emerald-500 px-4 py-2 font-medium text-slate-900 hover:bg-emerald-400"
      >
        Reintentar ahora
      </button>
    </div>
  )
}
