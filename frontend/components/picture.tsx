'use client'
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Clapperboard, Drama, Maximize, MicVocal, Music } from 'lucide-react'
import type { Category } from '@/lib/types'
import { useT } from './i18n'

const icons: Record<Category, typeof Drama> = { theatre: Drama, opera: MicVocal, concerts: Music, movies: Clapperboard }
const HOLD_MS = 150 // a shorter touch is a tap or the start of a scroll
const SLOP_PX = 8   // moving further before the peek shows means the finger is scrolling

/** Event image with a typographic fallback when the image is missing or fails.
    With `peek` (the event title), holding the image (finger, mouse button or Space) shows the
    whole poster over the page until it is released. */
export function Picture({ image, category, peek }: { image?: string; category: Category; peek?: string }) {
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const press = useRef<{ id: number; x: number; y: number; timer: number } | null>(null)
  const t = useT()
  const Icon = icons[category]

  const end = () => {
    if (press.current) clearTimeout(press.current.timer)
    press.current = null
    setOpen(false)
  }

  // While the peek is shown, the finger may move without scrolling the page: a scroll would
  // make the browser cancel the pointer and close the peek. This needs a non-passive listener.
  useEffect(() => {
    const el = btn.current
    if (!open || !el) return
    const stop = (e: TouchEvent) => e.preventDefault()
    el.addEventListener('touchmove', stop, { passive: false })
    return () => el.removeEventListener('touchmove', stop)
  }, [open])

  if (failed || !image) return (
    <div className={'source-image cat-' + category}>
      <div className="typeprint"><Icon size={40} /><strong>{t.cat[category].tag}</strong></div>
    </div>
  )
  if (!peek) return (
    <div className={'source-image cat-' + category}>
      <img src={image} alt="" onError={() => setFailed(true)} />
    </div>
  )

  const down = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (press.current) return // a second finger
    const id = e.pointerId
    press.current = { id, x: e.clientX, y: e.clientY, timer: window.setTimeout(() => setOpen(true), HOLD_MS) }
    // mouse: keep getting events when the pointer leaves the image (touch is captured already)
    if (e.pointerType === 'mouse') e.currentTarget.setPointerCapture(id)
  }
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const p = press.current
    if (!p || p.id !== e.pointerId || open) return
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLOP_PX) end()
  }
  const up = (e: PointerEvent<HTMLButtonElement>) => { if (press.current?.id === e.pointerId) end() }
  const key = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== ' ') return
    e.preventDefault() // no click, no page scroll
    if (e.type === 'keydown') setOpen(true)
    else setOpen(false)
  }

  return (
    <div className={'source-image cat-' + category}>
      <button ref={btn} type="button" className="x-peekbtn" aria-label={t.posterAlt(peek)}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
        onContextMenu={e => e.preventDefault()} onKeyDown={key} onKeyUp={key} onBlur={end}>
        <img src={image} alt={t.posterAlt(peek)} draggable={false} onError={() => setFailed(true)} />
        <span className="x-peeksticker" aria-hidden="true">
          <Maximize size={12} strokeWidth={2.5} />{t.peek}
        </span>
      </button>
      {open && createPortal(
        <div className="x-peek" onContextMenu={e => e.preventDefault()}><img src={image} alt={t.posterAlt(peek)} draggable={false} /></div>,
        document.body)}
    </div>
  )
}
