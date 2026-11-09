import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-5xl font-bold text-emerald-200">404</h1>
      <p className="text-slate-300">Esta página no existe en el piso.</p>
      <Link
        to="/"
        className="rounded-md bg-emerald-500 px-4 py-2 font-medium text-slate-900 hover:bg-emerald-400"
      >
        Volver al inicio
      </Link>
    </div>
  )
}
