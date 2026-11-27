'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { useT } from './i18n'

/**
 * Header control for the cities whose events the page shows: a button that names the choice
 * ("NRW", "Köln", "Köln +1") and opens a short list of toggle buttons.
 * The choice is a setting, not a filter of the moment: the guide keeps it in
 * localStorage, so the next visit opens with the same cities.
 */
export function CityPicker({ cities, selected, onFlip, onAll }: {
  /** All cities in the programme, in timeline order. */
  cities: string[]
  selected: Set<string>
  onFlip: (city: string) => void
  onAll: () => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const listId = useId()

  // close on a click outside the control or on Escape, like a native menu
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    addEventListener('pointerdown', outside)
    addEventListener('keydown', escape)
    return () => { removeEventListener('pointerdown', outside); removeEventListener('keydown', escape) }
  }, [open])

  if (cities.length < 2) return null // nothing to choose
  const all = selected.size === cities.length
  const chosen = cities.filter(c => selected.has(c))
  const label = all ? 'NRW' : chosen.length === 1 ? chosen[0] : `${chosen[0]} +${chosen.length - 1}`

  // narrow phones show the pin and, when not all cities are on, their number (as "My evening" does)
  return (
    <div className="x-city" ref={box}>
      <button aria-expanded={open} aria-controls={listId} aria-label={t.citiesButton(all ? t.allCities : chosen.join(', '))}
        onClick={() => setOpen(o => !o)}>
        <MapPin size={14} /><span>{label.toUpperCase()}</span>{!all && <b>{chosen.length}</b>}
      </button>
      {open && (
        <div id={listId} className="x-citylist" role="group" aria-label={t.citiesGroup}>
          <p>{t.citiesHint}</p>
          {cities.map(c => <button key={c} aria-pressed={selected.has(c)} onClick={() => onFlip(c)}>{c}</button>)}
          <button className="x-cityall" disabled={all} onClick={onAll}>{t.allCities}</button>
        </div>
      )}
    </div>
  )
}
