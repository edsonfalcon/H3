import { useCallback, useEffect, useState } from 'react'
import {
  fetchClearance,
  runClearanceCheck,
  fetchIntegrationStatus,
  requestDeployChallenge,
  verifyDeploy,
  registerStorage,
} from '../api/lumon'
import { saveRoster } from '../api/team'
import type { Clearance, IntegrationStatus, Roster, StorageResult, DeployChallenge } from '../api/schemas'
import { ApiError } from '../api/http'
import { request } from '../api/http'
import { HealthSchema } from '../api/schemas'
import { useEvents } from '../events/EventsProvider'

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-700 bg-slate-800/40 p-4">
      <h2 className="mb-3 text-lg font-semibold text-emerald-100">{titulo}</h2>
      {children}
    </section>
  )
}

function EstadoTexto({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  const color = ok === null ? 'text-slate-300' : ok ? 'text-emerald-300' : 'text-amber-300'
  return <span className={`font-medium ${color}`}>{children}</span>
}

export default function EstadoPage() {
  const { estado } = useEvents()
  const [salud, setSalud] = useState<'ok' | 'error' | 'cargando'>('cargando')
  const [integraciones, setIntegraciones] = useState<IntegrationStatus | null>(null)
  const [clearance, setClearance] = useState<Clearance | null>(null)
  const [roster, setRoster] = useState<Roster | null>(null)
  const [checkResultado, setCheckResultado] = useState<string[] | null>(null)
  const [checkOk, setCheckOk] = useState<boolean | null>(null)
  const [checkLoading, setCheckLoading] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)

  const [origin, setOrigin] = useState('')
  const [challenge, setChallenge] = useState<DeployChallenge | null>(null)
  const [deployError, setDeployError] = useState<string | null>(null)
  const [deployLoading, setDeployLoading] = useState(false)

  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseKey, setSupabaseKey] = useState('')
  const [storageResultado, setStorageResultado] = useState<StorageResult | null>(null)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [storageLoading, setStorageLoading] = useState(false)

  const [rosterNombres, setRosterNombres] = useState(['', '', ''])
  const [rosterCodigos, setRosterCodigos] = useState(['', '', ''])
  const [rosterMsg, setRosterMsg] = useState<string | null>(null)
  const [rosterError, setRosterError] = useState<string | null>(null)
  const [rosterLoading, setRosterLoading] = useState(false)

  const cargar = useCallback(() => {
    request('/meta/health', HealthSchema, { auth: false, retries: 0 })
      .then(() => setSalud('ok'))
      .catch(() => setSalud('error'))
    fetchIntegrationStatus()
      .then(setIntegraciones)
      .catch(() => setIntegraciones(null))
    fetchClearance()
      .then((data) => {
        setClearance(data)
        setRoster(data.roster)
        setRosterNombres(data.roster.members.length === 3 ? data.roster.members.map((m) => m.name) : ['', '', ''])
        setRosterCodigos(data.roster.members.length === 3 ? data.roster.members.map((m) => m.code) : ['', '', ''])
      })
      .catch(() => setClearance(null))
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const correrCheck = async () => {
    setCheckLoading(true)
    setCheckError(null)
    setCheckResultado(null)
    setCheckOk(null)
    try {
      const resultado = await runClearanceCheck()
      setCheckOk(resultado.granted)
      setCheckResultado(resultado.checks.map((c) => `${c.passed ? 'OK' : 'FALLA'} · ${c.name}: ${c.detail}`))
      cargar()
    } catch (err) {
      if (err instanceof ApiError) {
        setCheckError(err.message)
      } else {
        setCheckError('No se pudo correr la revisión automática.')
      }
    } finally {
      setCheckLoading(false)
    }
  }

  const pedirChallenge = async () => {
    setDeployLoading(true)
    setDeployError(null)
    setChallenge(null)
    try {
      setChallenge(await requestDeployChallenge(origin.trim()))
    } catch (err) {
      if (err instanceof ApiError) {
        setDeployError(err.message)
      } else {
        setDeployError('No se pudo pedir el desafío.')
      }
    } finally {
      setDeployLoading(false)
    }
  }

  const verificarDeploy = async () => {
    setDeployLoading(true)
    setDeployError(null)
    try {
      await verifyDeploy(origin.trim())
      cargar()
    } catch (err) {
      if (err instanceof ApiError) {
        setDeployError(err.message)
      } else {
        setDeployError('No se pudo verificar el dominio.')
      }
    } finally {
      setDeployLoading(false)
    }
  }

  const registrarStorage = async () => {
    setStorageLoading(true)
    setStorageError(null)
    setStorageResultado(null)
    try {
      setStorageResultado(
        await registerStorage({
          provider: 'SUPABASE',
          projectUrl: supabaseUrl.trim(),
          bucket: 'lumon-media',
          publicKey: supabaseKey.trim(),
        }),
      )
      cargar()
    } catch (err) {
      if (err instanceof ApiError) {
        setStorageError(err.message)
      } else {
        setStorageError('No se pudo registrar el storage.')
      }
    } finally {
      setStorageLoading(false)
    }
  }

  const guardarRoster = async () => {
    setRosterLoading(true)
    setRosterError(null)
    setRosterMsg(null)
    try {
      const members = rosterNombres.map((name, i) => ({ name: name.trim(), code: rosterCodigos[i].trim() }))
      const guardado = await saveRoster(members)
      setRoster(guardado)
      setRosterMsg('Cuadrilla inscrita.')
    } catch (err) {
      if (err instanceof ApiError) {
        setRosterError(err.message)
      } else {
        setRosterError('No se pudo inscribir la cuadrilla.')
      }
    } finally {
      setRosterLoading(false)
    }
  }

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold text-emerald-100">Estado del servicio</h1>

      <Tarjeta titulo="Despliegue">
        <ul className="grid gap-1 text-sm text-slate-300">
          <li>
            Build desplegado: <code className="rounded bg-slate-900 px-1">{__BUILD_SHA__}</code>
          </li>
          <li>
            API: <EstadoTexto ok={salud === 'ok'}>{salud === 'ok' ? 'responde' : salud === 'error' ? 'no responde' : 'cargando'}</EstadoTexto>
          </li>
          <li>
            Stream de eventos:{' '}
            <EstadoTexto ok={estado === 'conectado'}>
              {estado === 'conectado' ? 'conectado' : estado === 'conectando' ? 'conectando' : 'reconectando'}
            </EstadoTexto>
          </li>
          <li>
            Dominio:{' '}
            <EstadoTexto ok={integraciones?.deploy.verifiedAt != null}>
              {integraciones?.deploy.origin ?? 'sin verificar'}
            </EstadoTexto>
          </li>
          <li>
            Último build visto por la API: {integraciones?.deploy.lastBuildSeen ?? '—'}
          </li>
        </ul>
      </Tarjeta>

      <Tarjeta titulo="Piso de Pruebas">
        <p className="mb-3 text-sm text-slate-300">
          {clearance?.granted === true
            ? 'El Piso de Pruebas está abierto.'
            : 'El Piso de Pruebas está cerrado. Corre la revisión automática desde esta página.'}
        </p>
        <button
          type="button"
          onClick={correrCheck}
          disabled={checkLoading}
          className="rounded-md bg-emerald-500 px-4 py-2 font-semibold text-slate-900 hover:bg-emerald-400 disabled:opacity-60"
        >
          {checkLoading ? 'Revisando…' : 'Abrir el Piso de Pruebas'}
        </button>
        {checkError !== null && <p role="alert" className="mt-3 text-sm text-red-300">{checkError}</p>}
        {checkResultado !== null && (
          <ul className="mt-3 grid gap-1 text-sm">
            {checkResultado.map((linea) => (
              <li
                key={linea}
                className={linea.startsWith('OK') ? 'text-emerald-300' : 'text-amber-300'}
              >
                {linea}
              </li>
            ))}
            <li className={checkOk ? 'text-emerald-300' : 'text-amber-300'}>
              {checkOk ? 'Piso de Pruebas abierto.' : 'Aún no pasa la revisión.'}
            </li>
          </ul>
        )}
        {clearance !== null && (
          <p className="mt-3 text-xs text-slate-400">
            Workspace {clearance.workspace.kind} · caos {clearance.workspace.chaosLevel} · ronda aprobada:{' '}
            {clearance.round.approved ? 'sí' : 'no'}
          </p>
        )}
      </Tarjeta>

      <Tarjeta titulo="Cuadrilla (roster de la Sala de Bienestar)">
        {roster?.locked === true && (
          <p className="mb-3 text-sm text-amber-300">El roster ya está bloqueado por un sorteo.</p>
        )}
        <div className="grid gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label htmlFor={`roster-nombre-${i}`} className="mb-1 block text-xs text-slate-300">
                  Integrante {i + 1}: nombre
                </label>
                <input
                  id={`roster-nombre-${i}`}
                  type="text"
                  value={rosterNombres[i]}
                  onChange={(e) =>
                    setRosterNombres((actual) => actual.map((v, j) => (j === i ? e.target.value : v)))
                  }
                  className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-100"
                />
              </div>
              <div>
                <label htmlFor={`roster-codigo-${i}`} className="mb-1 block text-xs text-slate-300">
                  Integrante {i + 1}: código
                </label>
                <input
                  id={`roster-codigo-${i}`}
                  type="text"
                  value={rosterCodigos[i]}
                  onChange={(e) =>
                    setRosterCodigos((actual) => actual.map((v, j) => (j === i ? e.target.value : v)))
                  }
                  className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-100"
                />
              </div>
            </div>
          ))}
        </div>
        {rosterError !== null && <p role="alert" className="mt-2 text-sm text-red-300">{rosterError}</p>}
        {rosterMsg !== null && <p className="mt-2 text-sm text-emerald-300">{rosterMsg}</p>}
        <button
          type="button"
          onClick={guardarRoster}
          disabled={rosterLoading || roster?.locked === true}
          className="mt-3 rounded-md border border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-60"
        >
          {rosterLoading ? 'Guardando…' : 'Inscribir cuadrilla'}
        </button>
        {roster !== null && (
          <p className="mt-2 text-xs text-slate-400">
            {roster.members.length}/3 integrantes · completo: {roster.complete ? 'sí' : 'no'}
          </p>
        )}
      </Tarjeta>

      <Tarjeta titulo="Verificar dominio de producción">
        <label htmlFor="deploy-origin" className="mb-1 block text-xs text-slate-300">
          Origen de la app desplegada
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="deploy-origin"
            type="url"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="https://tu-app.vercel.app"
            className="w-72 rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-100"
          />
          <button
            type="button"
            onClick={pedirChallenge}
            disabled={deployLoading || origin.trim() === ''}
            className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60"
          >
            Pedir token
          </button>
          <button
            type="button"
            onClick={verificarDeploy}
            disabled={deployLoading || origin.trim() === ''}
            className="rounded-md border border-emerald-500 px-3 py-1.5 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-60"
          >
            Verificar dominio
          </button>
        </div>
        {deployError !== null && <p role="alert" className="mt-2 text-sm text-red-300">{deployError}</p>}
        {challenge !== null && (
          <div className="mt-3 rounded-md border border-slate-600 bg-slate-900/60 p-3 text-sm">
            <p className="mb-2 text-slate-300">
              Publica este token como texto plano en{' '}
              <code className="rounded bg-slate-800 px-1">
                {challenge.origin.replace(/\/$/, '') + challenge.wellKnownPath}
              </code>{' '}
              y luego pulsa «Verificar dominio».
            </p>
            <p className="rounded bg-slate-800 px-2 py-1 font-mono text-emerald-200">{challenge.token}</p>
          </div>
        )}
      </Tarjeta>

      <Tarjeta titulo="Storage de imágenes (Supabase)">
        <p className="mb-3 text-xs text-slate-400">
          Registra el bucket público <code className="rounded bg-slate-800 px-1">lumon-media</code> con la clave
          publicable del proyecto. La API lo prueba de verdad antes de aprobarlo.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor="storage-url" className="mb-1 block text-xs text-slate-300">
              URL del proyecto
            </label>
            <input
              id="storage-url"
              type="url"
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
              placeholder="https://abcd1234.supabase.co"
              className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="storage-key" className="mb-1 block text-xs text-slate-300">
              Clave publicable (anon)
            </label>
            <input
              id="storage-key"
              type="text"
              value={supabaseKey}
              onChange={(e) => setSupabaseKey(e.target.value)}
              placeholder="sb_publishable_… o JWT anon"
              className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-100"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={registrarStorage}
          disabled={storageLoading || supabaseUrl.trim() === '' || supabaseKey.trim() === ''}
          className="mt-3 rounded-md border border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-60"
        >
          {storageLoading ? 'Probando storage…' : 'Registrar y verificar storage'}
        </button>
        {storageError !== null && <p role="alert" className="mt-2 text-sm text-red-300">{storageError}</p>}
        {storageResultado !== null && (
          <ul className="mt-3 grid gap-1 text-sm">
            {storageResultado.checks.map((c) => (
              <li key={c.name} className={c.passed ? 'text-emerald-300' : 'text-amber-300'}>
                {c.passed ? 'OK' : 'FALLA'} · {c.name}: {c.detail}
              </li>
            ))}
          </ul>
        )}
        {integraciones?.storage.config !== null && integraciones?.storage.config !== undefined && (
          <p className="mt-2 text-xs text-slate-400">
            Registrado: {integraciones.storage.config.projectUrl ?? ''} ·{' '}
            {integraciones.storage.verifiedAt !== null ? 'verificado' : 'sin verificar'}
          </p>
        )}
      </Tarjeta>
    </div>
  )
}
