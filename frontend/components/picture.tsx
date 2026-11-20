'use client'
import { useState } from 'react'
import { Clapperboard, Drama, Footprints, MicVocal, Music } from 'lucide-react'
import type { Category } from '@/lib/types'
import { useT } from './i18n'

const icons: Record<Category, typeof Drama> = { theatre: Drama, opera: MicVocal, dance: Footprints, concerts: Music, movies: Clapperboard }

/** Event image with a typographic fallback when the image is missing or fails.
    The image takes no pointer events and cannot be dragged, so a long press acts on the
    card or button around it instead of opening the phone's image preview or drag copy. */
export function Picture({ image, category }: { image?: string; category: Category }) {
  const [failed, setFailed] = useState(false)
  const t = useT()
  const Icon = icons[category]

  if (failed || !image) return (
    <div className={'source-image cat-' + category}>
      <div className="typeprint"><Icon size={40} /><strong>{t.cat[category].tag}</strong></div>
    </div>
  )
  return (
    <div className={'source-image cat-' + category}>
      <img src={image} alt="" draggable={false} onError={() => setFailed(true)} />
    </div>
  )
}
