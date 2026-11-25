import { CONTACT_LIMITS as LIMITS } from '@/lib/contact'
import { getPool } from '@/lib/get-programme'

/**
 * Stores a message from the contact form in the `messages` table.
 *
 * The body is JSON: `name` and `email` are optional, `message` is required.
 * `website` is a field that people never see (a honeypot): bots fill in every
 * field, so a request with `website` set is accepted but not stored.
 * Without a database (demo programme) the form is not available (503).
 */
export async function POST(req: Request) {
  const db = getPool()
  if (!db) return Response.json({ error: 'unavailable' }, { status: 503 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid' }, { status: 400 })
  }
  const field = (key: keyof typeof LIMITS) => (typeof body[key] === 'string' ? (body[key] as string).trim() : '')
  const name = field('name'), email = field('email'), message = field('message')
  if (!message || (Object.keys(LIMITS) as (keyof typeof LIMITS)[]).some(k => field(k).length > LIMITS[k]))
    return Response.json({ error: 'invalid' }, { status: 400 })
  if (body.website) return Response.json({ ok: true })

  await db.query('INSERT INTO messages (name, email, message) VALUES ($1, $2, $3)', [name || null, email || null, message])
  return Response.json({ ok: true })
}
