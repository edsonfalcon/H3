import type { ReactNode } from 'react'
import { useSession } from './SessionContext'
import type { Permission } from '../api/schemas'
import { SinPermisoPage } from '../pages/SinPermisoPage'

export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useSession()

  if (!can(permission)) {
    return <SinPermisoPage permission={permission} />
  }

  return <>{children}</>
}
