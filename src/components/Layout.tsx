import { NavLink, useNavigate, Outlet } from 'react-router-dom'
import { useSession } from '../auth/SessionContext'
import type { Permission } from '../api/schemas'

const LINKS: Array<{ to: string; label: string; permission: Permission }> = [
  { to: '/files', label: 'Archivos', permission: 'files:read' },
  { to: '/refiners', label: 'Expedientes', permission: 'refiners:read' },
  { to: '/incidents', label: 'Incidencias', permission: 'incidents:read' },
]

export function Layout() {
  const { me, logout, can } = useSession()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-700 bg-slate-900/60">
        <nav aria-label="Principal" className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <NavLink to="/files" className="text-lg font-semibold tracking-wide text-emerald-300">
            Lumon MDR
          </NavLink>
          <ul className="flex flex-wrap items-center gap-1">
            {LINKS.filter((link) => can(link.permission)).map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-1.5 text-sm font-medium ${
                      isActive ? 'bg-emerald-500/20 text-emerald-200' : 'text-slate-300 hover:bg-slate-800'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
            <li>
              <NavLink
                to="/estado"
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm font-medium ${
                    isActive ? 'bg-emerald-500/20 text-emerald-200' : 'text-slate-300 hover:bg-slate-800'
                  }`
                }
              >
                Estado
              </NavLink>
            </li>
          </ul>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-slate-300">
              {me?.team.code} · {me?.displayName}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md border border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Salir
            </button>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
