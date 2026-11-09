export function SinPermisoPage({ permission }: { permission: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold text-amber-200">Sin permiso</h1>
      <p className="max-w-md text-slate-300">
        Tu rol en este workspace no incluye el permiso <code className="rounded bg-slate-800 px-1">{permission}</code>,
        por lo que no puedes entrar a esta sección.
      </p>
      <a
        href="/"
        className="rounded-md bg-emerald-500 px-4 py-2 font-medium text-slate-900 hover:bg-emerald-400"
      >
        Volver al inicio
      </a>
    </div>
  )
}
