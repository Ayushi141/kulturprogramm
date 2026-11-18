'use client'
import { useState } from 'react'
import { Clapperboard, Drama, MicVocal } from 'lucide-react'
import type { Category } from '@/lib/types'
import { useT } from './i18n'

const icons = { theatre: Drama, opera: MicVocal, movies: Clapperboard }

/** Event image with a typographic fallback when the image is missing or fails. */
export function Picture({ image, category }: { image?: string; category: Category }) {
  const [failed, setFailed] = useState(false)
  const t = useT()
  const Icon = icons[category]
  return (
    <div className={'source-image cat-' + category}>
      {!failed && image
        ? <img src={image} alt="" onError={() => setFailed(true)} />
        : <div className="typeprint"><Icon size={40} /><strong>{t.cat[category].tag}</strong></div>}
    </div>
  )
}
