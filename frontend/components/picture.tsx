'use client'
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Clapperboard, Drama, Footprints, Maximize, MicVocal, Music } from 'lucide-react'
import type { Category } from '@/lib/types'
import { useT } from './i18n'

const icons: Record<Category, typeof Drama> = { theatre: Drama, opera: MicVocal, dance: Footprints, concerts: Music, movies: Clapperboard }
const HOLD_MS = 150 // a shorter press may still turn into a scroll: the peek waits this long
const TAP_MS = 300  // released sooner: a tap, the poster stays open; later: a hold, it closes
const SLOP_PX = 8   // moving further before the peek shows means the finger is scrolling

/** Event image with a typographic fallback when the image is missing or fails.
    With `peek` (the event title), the image opens the whole poster over the page. A tap (or
    Enter) keeps it open until the next tap anywhere or Escape. Holding (finger, mouse button or
    Space) shows it only while held. */
export function Picture({ image, category, peek }: { image?: string; category: Category; peek?: string }) {
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  // open after a tap: stays until the next tap. `pinnedAt` ignores the tap's own late click.
  const [pinned, setPinned] = useState(false)
  const pinnedAt = useRef(0)
  const btn = useRef<HTMLButtonElement>(null)
  const press = useRef<{ id: number; x: number; y: number; at: number; timer: number } | null>(null)
  const t = useT()
  const Icon = icons[category]

  const end = () => {
    if (press.current) clearTimeout(press.current.timer)
    press.current = null
    setOpen(false)
    setPinned(false)
  }
  const pin = () => {
    if (press.current) clearTimeout(press.current.timer)
    press.current = null
    pinnedAt.current = Date.now()
    setOpen(true)
    setPinned(true)
  }

  // Escape closes a pinned poster. Captured first, so a modal card does not close as well.
  useEffect(() => {
    if (!pinned) return
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      end()
    }
    document.addEventListener('keydown', esc, true)
    return () => document.removeEventListener('keydown', esc, true)
  }, [pinned])

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
    press.current = { id, x: e.clientX, y: e.clientY, at: Date.now(), timer: window.setTimeout(() => setOpen(true), HOLD_MS) }
    // mouse: keep getting events when the pointer leaves the image (touch is captured already)
    if (e.pointerType === 'mouse') e.currentTarget.setPointerCapture(id)
  }
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const p = press.current
    if (!p || p.id !== e.pointerId || open) return
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLOP_PX) end()
  }
  const up = (e: PointerEvent<HTMLButtonElement>) => {
    const p = press.current
    if (p?.id !== e.pointerId) return
    if (Date.now() - p.at < TAP_MS) pin()
    else end()
  }
  // the browser cancels the pointer when the finger scrolls: never a tap
  const cancel = (e: PointerEvent<HTMLButtonElement>) => { if (press.current?.id === e.pointerId && !pinned) end() }
  const key = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' && e.type === 'keydown') {
      e.preventDefault()
      return pin()
    }
    if (e.key !== ' ') return
    e.preventDefault() // no click, no page scroll
    if (e.type === 'keydown') setOpen(true)
    else setOpen(false)
  }
  // the next tap anywhere closes a pinned poster (not the late click of the tap that opened it)
  const close = () => { if (Date.now() - pinnedAt.current > TAP_MS) end() }

  return (
    <div className={'source-image cat-' + category}>
      <button ref={btn} type="button" className="x-peekbtn" aria-label={t.posterAlt(peek)}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel}
        onContextMenu={e => e.preventDefault()} onKeyDown={key} onKeyUp={key} onBlur={() => { if (!pinned) end() }}>
        <img src={image} alt={t.posterAlt(peek)} draggable={false} onError={() => setFailed(true)} />
        <span className="x-peeksticker" aria-hidden="true">
          <Maximize size={12} strokeWidth={2.5} />{t.peek}
        </span>
      </button>
      {/* inside a modal dialog (the event card in the poster view) the peek must join the dialog:
          a modal sits in the top layer, above anything portalled to the body */}
      {open && createPortal(
        <div className={pinned ? 'x-peek x-peek-pinned' : 'x-peek'} onClick={pinned ? close : undefined}
          onContextMenu={e => e.preventDefault()}><img src={image} alt={t.posterAlt(peek)} draggable={false} /></div>,
        btn.current?.closest('dialog') ?? document.body)}
    </div>
  )
}
