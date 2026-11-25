'use client'
import { useState } from 'react'
import { CONTACT_LIMITS } from '@/lib/contact'
import { DICTS, type Lang } from '@/lib/i18n'
import { LEGAL_PATH } from '@/lib/legal-path'

/**
 * The contact form of the imprint: the second fast way to reach the operator that § 5 DDG asks
 * for, next to the email address. It posts to /api/contact, which stores the message in the
 * database. The field "website" is hidden from people; bots fill it in (see the route).
 */
export function ContactForm({ lang }: { lang: Lang }) {
  const t = DICTS[lang]
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')

  async function send(form: HTMLFormElement) {
    setState('sending')
    const data = Object.fromEntries(new FormData(form))
    try {
      const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      setState(res.ok ? 'sent' : 'failed')
      if (res.ok) form.reset()
    } catch {
      setState('failed')
    }
  }

  if (state === 'sent') return <p className="x-legalnote" role="status">{t.contactSent}</p>
  return (
    <form className="x-contact" onSubmit={e => { e.preventDefault(); send(e.currentTarget) }}>
      <label>{t.contactName}<input name="name" maxLength={CONTACT_LIMITS.name} autoComplete="name" /></label>
      <label>{t.contactEmail}<input name="email" type="email" maxLength={CONTACT_LIMITS.email} autoComplete="email" /></label>
      <label>{t.contactMessage}<textarea name="message" required rows={6} maxLength={CONTACT_LIMITS.message} /></label>
      {/* honeypot: invisible to people and screen readers, filled in by bots */}
      <input className="x-hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <p className="x-legalnote">{t.contactNote} <a href={LEGAL_PATH.privacy[lang]}>{t.privacy}</a></p>
      {state === 'failed' && <p className="x-legalnote" role="alert">{t.contactFailed}</p>}
      <button className="x-send" disabled={state === 'sending'}>{t.contactSend}</button>
    </form>
  )
}
