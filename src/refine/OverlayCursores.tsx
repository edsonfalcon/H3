import { useEffect, useState } from 'react'

const ALTO_CELDA = 24
const ANCHO_CELDA = 24

export interface CursorOverlay {
  userId: number
  displayName: string
  r: number | null
  c: number | null
  color: string
}

export function OverlayCursores({
  contenedor,
  cursores,
}: {
  contenedor: React.RefObject<HTMLDivElement | null>
  cursores: CursorOverlay[]
}) {
  const [scroll, setScroll] = useState({ top: 0, left: 0, alto: 0, ancho: 0 })

  useEffect(() => {
    const el = contenedor.current
    if (el === null) {
      return
    }
    const medir = () => {
      setScroll({ top: el.scrollTop, left: el.scrollLeft, alto: el.clientHeight, ancho: el.clientWidth })
    }
    medir()
    el.addEventListener('scroll', medir, { passive: true })
    const observer = new ResizeObserver(medir)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', medir)
      observer.disconnect()
    }
  }, [contenedor])

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-lg">
      {cursores.map((cursor) => {
        if (cursor.r === null || cursor.c === null) {
          return null
        }
        const top = cursor.r * ALTO_CELDA - scroll.top - 4
        const left = cursor.c * ANCHO_CELDA - scroll.left - 4
        if (
          top < -ALTO_CELDA ||
          left < -ANCHO_CELDA ||
          top > scroll.alto ||
          left > scroll.ancho
        ) {
          return null
        }
        return (
          <div
            key={cursor.userId}
            className="absolute flex h-6 w-6 items-center justify-center rounded-full border-2 text-[9px] font-bold"
            style={{
              top,
              left,
              borderColor: cursor.color,
              color: cursor.color,
              backgroundColor: 'rgba(12, 18, 16, 0.85)',
            }}
            title={cursor.displayName}
          >
            {cursor.displayName.slice(0, 1)}
          </div>
        )
      })}
    </div>
  )
}
