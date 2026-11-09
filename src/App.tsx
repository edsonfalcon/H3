import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { SessionProvider, useSession } from './auth/SessionContext'
import { RequireAuth } from './auth/RequireAuth'
import { RequirePermission } from './auth/RequirePermission'
import { Layout } from './components/Layout'
import { HealthGate } from './components/HealthGate'
import { ErrorBoundary } from './components/ErrorBoundary'
import { EventsProvider } from './events/EventsProvider'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import { NotFound } from './pages/NotFound'

const FilesPage = lazy(() => import('./pages/FilesPage'))
const RefinePage = lazy(() => import('./pages/refine/RefinePage'))
const RefinersPage = lazy(() => import('./pages/refiners/RefinersPage'))
const BadgePage = lazy(() => import('./pages/refiners/BadgePage'))
const RefinerEditPage = lazy(() => import('./pages/refiners/RefinerEditPage'))
const IncidentsPage = lazy(() => import('./pages/incidents/IncidentsPage'))
const IncidentNewPage = lazy(() => import('./pages/incidents/IncidentNewPage'))
const EstadoPage = lazy(() => import('./pages/EstadoPage'))

function Cargando() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <p className="text-slate-300">Cargando…</p>
    </div>
  )
}

function SessionNavigator() {
  const { status } = useSession()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const publica =
      location.pathname === '/login' || location.pathname === '/registro'
    if (status === 'anon' && !publica) {
      navigate('/login', {
        replace: true,
        state: { from: location.pathname + location.search },
      })
    }
  }, [status, location.pathname, location.search, navigate])

  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <HealthGate>
          <ErrorBoundary>
            <SessionNavigator />
            <Suspense fallback={<Cargando />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/registro" element={<RegisterPage />} />
                <Route
                  element={
                    <RequireAuth>
                      <EventsProvider>
                        <Layout />
                      </EventsProvider>
                    </RequireAuth>
                  }
                >
                  <Route index element={<Navigate to="/files" replace />} />
                  <Route
                    path="/files"
                    element={
                      <RequirePermission permission="files:read">
                        <FilesPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="/files/:id/refine"
                    element={
                      <RequirePermission permission="files:read">
                        <RefinePage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="/refiners"
                    element={
                      <RequirePermission permission="refiners:read">
                        <RefinersPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="/refiners/:id/badge"
                    element={
                      <RequirePermission permission="refiners:write">
                        <BadgePage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="/refiners/:id/edit"
                    element={
                      <RequirePermission permission="refiners:write">
                        <RefinerEditPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="/incidents"
                    element={
                      <RequirePermission permission="incidents:read">
                        <IncidentsPage />
                      </RequirePermission>
                    }
                  />
                  <Route
                    path="/incidents/new"
                    element={
                      <RequirePermission permission="incidents:create">
                        <IncidentNewPage />
                      </RequirePermission>
                    }
                  />
                  <Route path="/estado" element={<EstadoPage />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </HealthGate>
      </SessionProvider>
    </BrowserRouter>
  )
}
