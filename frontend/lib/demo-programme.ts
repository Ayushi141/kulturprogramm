/**
 * Demo fixture. Generates half a year of plausible programme from weekly
 * venue rules, starting today: cinemas two weeks ahead, stage productions in
 * runs of a few weeks (RUNS). Times, prices and most titles are invented; event
 * links point to the venue home pages.
 * Used by `getProgramme()` when no database is configured.
 */
import type { Category, Event, Programme, Venue } from './types'
import { cultureDay, fromCultureDay, shiftDate, weekday } from './time'

// north to south: Duisburg → Düsseldorf → Köln
const VENUES: (Venue & { url: string })[] = [
  { id: 'theater-du', name: 'Theater Duisburg', city: 'Duisburg', url: 'https://www.theater-duisburg.de/' },
  { id: 'filmforum', name: 'filmforum', city: 'Duisburg', url: 'https://www.filmforum.de/' },
  { id: 'kom', name: 'Kom(m)ödchen', city: 'Düsseldorf', url: 'https://www.kommoedchen.de/' },
  { id: 'blackbox', name: 'Black Box Kino', city: 'Düsseldorf', url: 'https://www.duesseldorf.de/filmmuseum' },
  { id: 'oper', name: 'Deutsche Oper am Rhein', city: 'Düsseldorf', url: 'https://www.operamrhein.de/' },
  { id: 'schauspiel', name: 'Schauspielhaus', city: 'Düsseldorf', url: 'https://www.dhaus.de/' },
  { id: 'bambi', name: 'Bambi', city: 'Düsseldorf', url: 'https://filmkunstkinos.de/' },
  { id: 'atelier', name: 'Atelier im Savoy', city: 'Düsseldorf', url: 'https://filmkunstkinos.de/' },
  { id: 'fft', name: 'FFT im KAP1', city: 'Düsseldorf', url: 'https://www.fft-duesseldorf.de/' },
  { id: 'tanzhaus', name: 'tanzhaus nrw', city: 'Düsseldorf', url: 'https://www.tanzhaus-nrw.de/' },
  { id: 'metropol', name: 'Metropol', city: 'Düsseldorf', url: 'https://filmkunstkinos.de/' },
  { id: 'tonhalle', name: 'Tonhalle', city: 'Düsseldorf', url: 'https://www.tonhalle.de/' },
  { id: 'schauspiel-k', name: 'Schauspiel Köln', city: 'Köln', url: 'https://www.schauspiel.koeln/' },
  { id: 'philharmonie-k', name: 'Kölner Philharmonie', city: 'Köln', url: 'https://www.koelner-philharmonie.de/' },
  { id: 'oper-k', name: 'Oper Köln', city: 'Köln', url: 'https://www.oper.koeln/' },
  { id: 'odeon', name: 'Odeon', city: 'Köln', url: 'https://www.odeon-koeln.de/' },
]
const FILMS: [string, number][] = [
  ['Butterfly: Rückkehr nach Gran Canaria', 100], ['Ein Sommer in Łódź', 125], ['Die Nacht am Fluss', 118],
  ['Kurzfilmrolle', 90], ['Das stille Haus', 112], ['Nordlicht', 98], ['Am Ende des Sommers', 131],
]
const CLASSICS = ['Metropolis (Stummfilm + Live-Klavier)', 'Der Himmel über Berlin', 'Nosferatu (Stummfilm + Live-Klavier)', 'M — Eine Stadt sucht einen Mörder']
/** Concert programmes change every week: week n plays CONCERTS[n % length]. */
const CONCERTS = ['Sinfoniekonzert: Brahms 4', 'Mahler 5', 'Kammermusik am Abend', 'Beethoven: Klavierkonzerte', 'Jazz-Orchester: Big Band Night']
const IMAGES: Partial<Record<Category, string>> = { theatre: '/images/theatre.webp', concerts: '/images/music.webp', movies: '/images/cinema.webp' }

/** Run of each stage production in weeks from today [first, last]. Titles not listed run all season. */
const RUNS: Record<string, [number, number]> = {
  'Der Hobbit': [0, 16], 'Der Hobbit · Familienvorstellung': [0, 8], 'Die Physiker · Kleines Haus': [0, 10],
  'Stadt ohne Autos (Performance)': [0, 6], 'Gravity Lines (Tanz)': [0, 4], 'Ballett am Rhein: b.52': [10, 20],
  'Don Giovanni': [8, 18], 'Die Zauberflöte': [6, 20], 'La Bohème': [0, 9], 'Tosca': [0, 12],
  'Carmen': [4, 26], 'Die Fledermaus': [4, 12], 'Der Rosenkavalier': [12, 26], 'Hänsel und Gretel': [0, 6],
}
/** Cinemas publish about two weeks ahead. */
const CINEMA_DAYS = 14
/** Days of demo programme: half a year, as getProgramme() loads from the database. */
const HORIZON = 183

/** "01:30" → 1530 (before 06:00 counts as after midnight). */
const tm = (s: string) => { let [h, m] = s.split(':').map(Number); if (h < 6) h += 24; return h * 60 + m }

function dayProgramme(day: string, i: number): Event[] {
  const out: Event[] = [], dw = weekday(day), is = (...d: number[]) => d.includes(dw)
  /** `e` is an end time, a length in minutes, or null when the venue publishes no end. */
  const add = (venueId: string, category: Category, title: string, s: string, e: string | number | null, price: string) => {
    const run = RUNS[title], week = Math.floor(i / 7)
    if (category === 'movies' ? i >= CINEMA_DAYS : run && (week < run[0] || week > run[1])) return
    const sm = tm(s), em = e === null ? null : typeof e === 'number' ? sm + e : tm(e)
    out.push({
      id: `demo-${day}-${out.length}`, productionId: `${venueId}|${title}`, title, category, venueId, price,
      start: fromCultureDay(day, sm).toISOString(), end: em === null ? undefined : fromCultureDay(day, em).toISOString(),
      url: VENUES.find(v => v.id === venueId)!.url,
      image: category === 'theatre' && title !== 'Der Hobbit' ? undefined : IMAGES[category],
    })
  }
  // theatre — Düsseldorf
  if (is(3, 4, 5, 6)) add('kom', 'theatre', 'Kabarett: Alles im Fluss', '20:00', '22:00', '28 €')
  if (is(0)) add('kom', 'theatre', 'Kabarett: Alles im Fluss', '18:00', '20:00', '28 €')
  if (is(3, 5)) add('schauspiel', 'theatre', 'Der Hobbit', '19:30', '22:15', '18–49 €')
  if (is(6)) {
    add('schauspiel', 'theatre', 'Der Hobbit · Familienvorstellung', '15:00', '17:45', '12–29 €')
    add('schauspiel', 'theatre', 'Der Hobbit', '19:30', '22:15', '18–49 €')
  }
  if (is(0)) add('schauspiel', 'theatre', 'Der Hobbit', '16:00', '18:45', '18–49 €')
  if (is(2, 4, 5)) add('schauspiel', 'theatre', 'Die Physiker · Kleines Haus', '20:00', null, '15–32 €')
  if (is(4, 5, 6)) add('fft', 'theatre', 'Stadt ohne Autos (Performance)', '20:00', null, '16 €')
  if (is(5)) {
    add('tanzhaus', 'dance','Gravity Lines (Tanz)', '19:00', '20:15', '18 €')
    add('tanzhaus', 'dance','Gravity Lines (Tanz)', '21:30', '22:45', '18 €')
  }
  if (is(6)) add('tanzhaus', 'dance','Gravity Lines (Tanz)', '20:00', '21:15', '18 €')
  // theatre — Duisburg, Köln
  if (is(5)) add('theater-du', 'dance', 'Ballett am Rhein: b.52', '19:30', '21:30', '15–48 €')
  if (is(3, 4, 5, 6)) add('schauspiel-k', 'theatre', 'Die Räuber', '19:30', '22:00', '17–42 €')
  if (is(0)) add('schauspiel-k', 'theatre', 'Die Räuber', '18:00', '20:30', '17–42 €')
  // opera
  if (is(2)) add('oper', 'opera', 'Don Giovanni', '19:30', '22:45', '22–89 €')
  if (is(4)) add('oper', 'opera', 'Die Zauberflöte', '19:30', '22:30', '22–89 €')
  if (is(5)) add('oper', 'opera', 'La Bohème', '19:30', '22:10', '22–89 €')
  if (is(6)) add('oper', 'opera', 'Tosca', '19:30', '22:15', '22–89 €')
  if (is(0)) add('oper', 'opera', 'La Bohème', '18:00', '20:40', '22–89 €')
  if (is(3, 6)) add('theater-du', 'opera', 'Carmen', '19:30', '22:30', '18–72 €')
  if (is(0)) add('theater-du', 'opera', 'Die Fledermaus', '18:00', '21:00', '18–72 €')
  if (is(4, 6)) add('oper-k', 'opera', 'Der Rosenkavalier', '18:00', '22:15', '25–110 €')
  if (is(5)) add('oper-k', 'opera', 'Hänsel und Gretel', '18:00', '20:30', '15–65 €')
  if (is(0)) add('oper-k', 'opera', 'Hänsel und Gretel', '16:00', '18:30', '15–65 €')
  // concerts
  const week = Math.floor(i / 7), concert = (k: number) => CONCERTS[(week + k) % CONCERTS.length]
  if (is(5, 6)) add('tonhalle', 'concerts', concert(0), '20:00', '22:00', '19–65 €')
  if (is(0)) add('tonhalle', 'concerts', concert(0), '11:00', '13:00', '19–65 €')
  if (is(4, 0)) add('philharmonie-k', 'concerts', concert(2), '20:00', null, '15–75 €')
  // movies — fixed slots, films rotate through the week
  const CIN: Record<string, string[]> = {
    metropol: ['14:30', '17:00', '19:15', '21:30'], bambi: ['15:00', '17:30', '20:00', '22:15'], atelier: ['13:00', '15:45', '18:15', '20:45'],
    filmforum: ['18:00', '20:30'], odeon: ['17:30', '20:00', '22:15'],
  }
  Object.entries(CIN).forEach(([v, base], vi) => {
    const sl = [...base]
    if ((v === 'metropol' || v === 'filmforum') && is(5, 6)) sl.push(v === 'metropol' ? '23:45' : '22:45')
    if (v === 'atelier' && is(6, 0)) sl.unshift('11:00')
    sl.forEach((s, si) => { const f = FILMS[(vi * 3 + si + i) % FILMS.length]; add(v, 'movies', f[0], s, f[1] + 15, v === 'bambi' ? '10 €' : '11 €') })
    if (v === 'atelier' && is(1)) add(v, 'movies', 'Sneak Preview', '22:45', 125, '8 €')
  })
  if (is(3, 4, 5, 6)) add('blackbox', 'movies', CLASSICS[(i + dw) % CLASSICS.length], '20:00', 105, '8 €')
  if (is(0)) add('blackbox', 'movies', 'Kinderkino: Kurzfilme', '15:00', 75, '4 €')
  return out
}

export function demoProgramme(now = new Date()): Programme {
  const today = cultureDay(now).day
  const events = Array.from({ length: HORIZON }, (_, i) => dayProgramme(shiftDate(today, i), i)).flat()
  return { venues: VENUES.map(({ url, ...v }) => v), events, generatedAt: now.toISOString(), updatedAt: now.toISOString(), featured: ['schauspiel|Der Hobbit'], demo: true }
}
