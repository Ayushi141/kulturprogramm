/**
 * Interface texts. German is the default and lives at `/`; English lives at `/en`.
 * Programme data (titles, venue names) is not translated.
 */
import type { Category } from './types'

export type Lang = 'de' | 'en'
export const LANGS: Lang[] = ['de', 'en']
export const HOME: Record<Lang, string> = { de: '/', en: '/en' }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const en = {
  title: 'Kulturprogramm — theatre, opera and movies in NRW',
  description: 'Theatre, opera and movies in Düsseldorf, Köln and Duisburg on one timeline. Pick a day, plan your evening, get tickets.',
  toTop: 'Kulturprogramm — to the top',
  language: 'Language',
  myEvening: 'My evening',
  cat: {
    theatre: { label: 'Theatre', tag: 'THEATRE' },
    opera: { label: 'Opera', tag: 'OPERA' },
    movies: { label: 'Movies', tag: 'MOVIES' },
  } satisfies Record<Category, { label: string; tag: string }>,
  /** 0 = Sunday. */
  wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  wdl: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],

  // hero and day strip
  loading: 'Loading the programme…',
  /** Day name or "TODAY" before a date. */
  dateline: (day: string, date: string) => `${day} ${date}`,
  today: 'TODAY',
  tomorrow: 'TOMORROW',
  toCome: (n: number) => `${n} STILL TO COME.`,
  on: (n: number) => `${n} ${n === 1 ? 'THING' : 'THINGS'} ON.`,
  nothingOn: 'NOTHING ON.',
  events: (n: number) => `${n} ${n === 1 ? 'event' : 'events'}`,
  dayGroup: 'Day',

  // control bar and hints
  categoriesGroup: 'Categories (choose one or more)',
  viewGroup: 'View',
  timeline: 'Timeline',
  poster: 'Poster',
  inEvening: (n: number) => `${n} IN YOUR EVENING`,
  hintTimeline: 'Tap an event for details, tickets or to add it to your evening.',
  hintPoster: 'Bookmark an event to add it to your evening.',
  demo: 'DEMO PROGRAMME — invented times and titles; links go to venue home pages. Set PGPASSWORD_FILE to load the database.',
  keyZoom: 'drag on the whole-day strip to zoom · click it to move the view',
  footer: "Programme and images come from the venues' own websites.",

  // event details
  details: 'Programme details',
  close: 'Close',
  tickets: 'Tickets & details',
  add: 'Add to my evening',
  remove: 'Remove from my evening',
  removeShort: 'Remove',
  from: 'from',
  endNotAnnounced: 'end not announced',
  /** End of the evening when the last pick has no announced end. */
  open: 'open',

  // how an event relates to the plan
  inYourEvening: 'In your evening',
  alreadyStarted: 'Already started',
  overlaps: (names: string) => `overlaps ${names}`,
  mayOverlap: (names: string) => `may overlap ${names}`,
  clashWithPlan: (text: string) => `${cap(text)} in your evening`,

  // timeline
  timelineLabel: 'Timeline of events by venue',
  wholeDay: 'WHOLE DAY',
  onAtOnce: 'things on at once',
  dragToZoom: 'drag to zoom',
  now: 'now',
  running: (n: number, parts: [string, number][]) =>
    `${n} running${parts.length ? ': ' + parts.map(([label, k]) => `${k} ${label.toLowerCase()}`).join(', ') : ''}`,
  stripHint: 'click to move the view here · drag to zoom to a range',
  nothingInView: 'Nothing on in this part of the day — move the view on the whole-day strip above.',

  // poster view
  posterEmpty: 'Nothing left on this day for these categories. Try another day.',
  detailsFor: (title: string) => `Details for ${title}`,
  addTo: (title: string) => `Add to my evening: ${title}`,
  removeFrom: (title: string) => `Remove from my evening: ${title}`,
  starting: (n: number) => `${n} starting`,
  startedToday: (n: number) => `${n} more already started today — `,
  seeOnTimeline: 'see them on the timeline',

  // plan panel
  yourDay: (weekday: string) => `YOUR ${weekday.toUpperCase()}`,
  empty: 'EMPTY',
  emptyStart: 'Bookmark what you want to see',
  emptyExample: ' — for example ',
  at: (title: string, time: string) => `${title} at ${time}`,
  emptyEnd: '. Your picks for the day show up here in time order, with their ticket links.',
  out: 'OUT',
  stops: (n: number) => `${n} ${n === 1 ? 'STOP' : 'STOPS'}`,
  overlapsBy: (min: number) => `overlaps by ${min} min`,
  backToBack: 'back to back',
  breakOf: (min: number) => `${min} min break`,
  mayOverlapShort: 'may overlap',
  copyPlan: 'Copy plan',
  copied: 'Copied',
  copyBlocked: 'Copy blocked',
  clear: 'Clear',
}

export type Dict = typeof en

const de: Dict = {
  title: 'Kulturprogramm — Theater, Oper und Kino in NRW',
  description: 'Theater, Oper und Kino in Düsseldorf, Köln und Duisburg auf einer Timeline. Tag wählen, Abend planen, Tickets holen.',
  toTop: 'Kulturprogramm — nach oben',
  language: 'Sprache',
  myEvening: 'Mein Abend',
  cat: {
    theatre: { label: 'Theater', tag: 'THEATER' },
    opera: { label: 'Oper', tag: 'OPER' },
    movies: { label: 'Kino', tag: 'KINO' },
  },
  wd: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  wdl: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],

  loading: 'Programm wird geladen…',
  // German date style: "Mittwoch, 18.11."
  dateline: (day, date) => `${day}, ${date}`,
  today: 'HEUTE',
  tomorrow: 'MORGEN',
  toCome: n => `NOCH ${n} ${n === 1 ? 'EVENT' : 'EVENTS'}.`,
  on: n => `${n} ${n === 1 ? 'EVENT' : 'EVENTS'}.`,
  nothingOn: 'NICHTS LOS.',
  events: n => `${n} ${n === 1 ? 'Event' : 'Events'}`,
  dayGroup: 'Tag',

  categoriesGroup: 'Kategorien (eine oder mehrere)',
  viewGroup: 'Ansicht',
  timeline: 'Timeline',
  poster: 'Poster',
  inEvening: n => `${n} FÜR DEINEN ABEND`,
  hintTimeline: 'Tippe auf ein Event für Details, Tickets oder um es deinem Abend hinzuzufügen.',
  hintPoster: 'Merk dir ein Event vor, um es deinem Abend hinzuzufügen.',
  demo: 'DEMO-PROGRAMM — erfundene Zeiten und Titel; Links führen zu den Startseiten der Spielstätten. Setze PGPASSWORD_FILE, um die Datenbank zu laden.',
  keyZoom: 'auf dem Tagesstreifen ziehen zum Zoomen · klicken, um die Ansicht zu verschieben',
  footer: 'Programm und Bilder stammen von den Websites der Spielstätten.',

  details: 'Programmdetails',
  close: 'Schließen',
  tickets: 'Tickets & Details',
  add: 'Zu meinem Abend hinzufügen',
  remove: 'Aus meinem Abend entfernen',
  removeShort: 'Entfernen',
  from: 'ab',
  endNotAnnounced: 'Ende nicht angekündigt',
  open: 'offen',

  inYourEvening: 'In deinem Abend',
  alreadyStarted: 'Hat schon begonnen',
  overlaps: names => `überschneidet sich mit ${names}`,
  mayOverlap: names => `überschneidet sich vielleicht mit ${names}`,
  clashWithPlan: text => `${cap(text)} in deinem Abend`,

  timelineLabel: 'Timeline der Events nach Spielstätte',
  wholeDay: 'GANZER TAG',
  onAtOnce: 'gleichzeitig los',
  dragToZoom: 'ziehen zum Zoomen',
  now: 'jetzt',
  running: (n, parts) =>
    `${n} ${n === 1 ? 'läuft' : 'laufen'}${parts.length ? ': ' + parts.map(([label, k]) => `${k} ${label}`).join(', ') : ''}`,
  stripHint: 'klicken, um die Ansicht hierher zu verschieben · ziehen, um einen Bereich zu zoomen',
  nothingInView: 'In diesem Teil des Tages ist nichts los — verschieb die Ansicht oben auf dem Tagesstreifen.',

  posterEmpty: 'An diesem Tag ist in diesen Kategorien nichts mehr los. Probier einen anderen Tag.',
  detailsFor: title => `Details zu ${title}`,
  addTo: title => `Zu meinem Abend hinzufügen: ${title}`,
  removeFrom: title => `Aus meinem Abend entfernen: ${title}`,
  starting: n => `${n} ${n === 1 ? 'beginnt' : 'beginnen'}`,
  startedToday: n => `${n} ${n === 1 ? 'weiteres hat' : 'weitere haben'} heute schon begonnen — `,
  seeOnTimeline: 'in der Timeline ansehen',

  yourDay: weekday => `DEIN ${weekday.toUpperCase()}`,
  empty: 'LEER',
  emptyStart: 'Merk dir vor, was du sehen willst',
  emptyExample: ' — zum Beispiel ',
  at: (title, time) => `${title} um ${time}`,
  emptyEnd: '. Deine Auswahl für den Tag erscheint hier in zeitlicher Reihenfolge, mit Ticket-Links.',
  out: 'UNTERWEGS',
  stops: n => `${n} ${n === 1 ? 'STATION' : 'STATIONEN'}`,
  overlapsBy: min => `überschneidet sich um ${min} Min.`,
  backToBack: 'direkt nacheinander',
  breakOf: min => `${min} Min. Pause`,
  mayOverlapShort: 'überschneidet sich vielleicht',
  copyPlan: 'Plan kopieren',
  copied: 'Kopiert',
  copyBlocked: 'Kopieren blockiert',
  clear: 'Leeren',
}

export const DICTS: Record<Lang, Dict> = { de, en }
