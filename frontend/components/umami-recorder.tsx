'use client'

import Script from 'next/script'
import { useEffect, useState } from 'react'

/**
 * The Umami recorder: session replays and heatmaps (on and off, sample rate and masking: in the
 * Umami dashboard, website → Edit → "Replays & Heatmaps"). It loads from /k/r.js and sends to
 * /k/api/… (backend/deploy/Caddyfile).
 *
 * Unlike the tracker, the recorder ignores `data-do-not-track`. So this component loads it only
 * when the browser sends no Do Not Track signal, with the same test as the tracker. The test needs
 * `navigator`, so it runs after the page loads in the browser.
 */
export function UmamiRecorder({ websiteId }: { websiteId: string }) {
  const [load, setLoad] = useState(false)
  useEffect(() => {
    const dnt = navigator.doNotTrack ?? (window as { doNotTrack?: string }).doNotTrack
    setLoad(!(dnt === '1' || dnt === 'yes'))
  }, [])
  return load ? <Script src="/k/r.js" data-website-id={websiteId} /> : null
}
