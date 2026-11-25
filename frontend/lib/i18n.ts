/**
 * Interface texts. German is the default and lives at `/`; English lives at `/en`.
 * Programme data (titles, venue names) is not translated.
 */
import type { Category } from './types'

export type Lang = 'de' | 'en'
export const LANGS: Lang[] = ['de', 'en']
export const HOME: Record<Lang, string> = { de: '/', en: '/en' }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_DE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

const en = {
  title: 'Kulturprogramm — theatre, opera, dance, concerts and movies in NRW',
  description: 'Theatre, opera, dance, concerts and movies in NRW on one timeline. Pick a day, plan your evening, get tickets.',
  toTop: 'Kulturprogramm — to the top',
  language: 'Language',
  myEvening: 'My evening',
  cat: {
    theatre: { label: 'Theatre', tag: 'THEATRE' },
    opera: { label: 'Opera', tag: 'OPERA' },
    dance: { label: 'Dance', tag: 'DANCE' },
    concerts: { label: 'Concerts', tag: 'CONCERTS' },
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
  months: MONTHS_EN,
  monthsLong: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],

  // "later": everything after the seven days, up to six months
  later: 'LATER',
  until: (date: string) => `UNTIL ${date}`,
  shows: (n: number) => `${n} ${n === 1 ? 'show' : 'shows'}`,
  laterHead: (from: string, to: string) => `LATER ${from}–${to}`,
  showsAhead: (n: number) => `${n} ${n === 1 ? 'SHOW' : 'SHOWS'} AHEAD.`,
  nothingAnnounced: 'NOTHING ANNOUNCED.',
  saved: (n: number) => `${n} SAVED`,
  hintSeasonTimeline: 'Every square is one performance. Tap one for details, tickets or to save it.',
  hintSeasonPoster: 'One card per production, with its next show. Bookmark to save that show.',
  seasonLabel: 'Performances over the coming months by venue and production',
  seasonEmpty: 'No performances announced for these categories yet.',
  inLater: 'Saved',
  save: 'Save this show',
  productionsCount: (n: number) => `${n} ${n === 1 ? 'production' : 'productions'} · next show this month`,
  nextShow: (when: string, more: number, until: string) => `NEXT ${when}${more ? ` · +${more} UNTIL ${until}` : ''}`,
  saveNext: (title: string) => `Save the next show: ${title}`,
  removeNext: (title: string) => `Remove the next show: ${title}`,
  laterPanel: 'YOUR LATER EVENINGS',
  laterSum: (n: number, evenings: number) => `${n} SAVED · ${evenings} ${evenings === 1 ? 'EVENING' : 'EVENINGS'}`,
  laterEmpty: 'Tap a performance to save it. Theatre and opera often sell out weeks ahead, so the ticket link is right next to it.',

  // control bar and hints
  categoriesGroup: 'Categories (choose one or more)',
  viewGroup: 'View',
  timeline: 'Timeline',
  poster: 'Poster',
  read: 'Read',
  readSortDay: 'Context for everything on this day, by start time.',
  readSortLater: 'Context for everything in this range, by next date.',
  readAi: 'Researched and written by AI. Details may be wrong; the venue’s website has the final word.',
  readNew: 'NEW',
  readMore: (n: number) => n ? `Dates & tickets (+${n})` : 'Dates & tickets',
  readEmpty: 'The Souffleur has nothing on this selection yet.',
  readSave: 'Save',
  inEvening: (n: number) => `${n} IN YOUR EVENING`,
  hintTimeline: 'Tap an event for details, tickets or to add it to your evening.',
  hintPoster: 'Bookmark an event to add it to your evening.',
  inFocus: 'IN FOCUS',
  /** Folio line in the hero: today's issue number (day of the year) and place. */
  updated: (when: string) => `Updated ${when} · refreshed daily`,
  demo: 'DEMO PROGRAMME — invented times and titles; links go to venue home pages. Set PGPASSWORD_FILE to load the database.',
  keyZoom: 'drag on the whole-day strip to zoom · click it to move the view · drag or scroll the timeline sideways to move through the day',
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
  // other dates of the production
  moreDates: (n: number) => `+${n} more ${n === 1 ? 'date' : 'dates'}`,
  otherDates: 'MORE DATES',
  calendarLabel: 'Performances in two weeks',
  calendarMonthsLabel: 'Performances per month',
  /** Heading of the day grid; `from` is its first day. */
  calDays: (from: string) => `2 WEEKS FROM ${from}`,
  /** Heading of the month grid; `from` is its first month. */
  calMonths: (from: string) => `7 MONTHS FROM ${from.toUpperCase()}`,
  closeDates: 'Close dates',
  openDate: (when: string) => `Open ${when}`,
  // the context drawer: a note by the Souffleur (the Ticket for films)
  context: 'Context',
  contextHead: 'CONTEXT',
  /** Below a note the enricher wrote; the fixed lines are written by hand and carry no label. */
  aiGenerated: 'AI-GENERATED, MAY CONTAIN ERRORS',
  closeContext: 'Close context',
  souffleur: 'The Souffleur',
  souffleurAbout: 'Sits at the front of the stage and whispers what you should know.',
  ticket: 'The Ticket',
  ticketAbout: 'Gets into every film and knows what it is about.',
  /** Said when the enricher found nothing; one is picked per production. */
  contextNothing: [
    'I looked. Nothing that the listing does not already say.',
    'Honestly: about this one I know no more than the programme does.',
    'No prizes, no scandals, no anecdotes. Sometimes an evening is just an evening.',
  ],

  // how an event relates to the plan
  inYourEvening: 'In your evening',
  /** An event whose announced end has passed. */
  alreadyOver: 'Already over',
  /** A shared link to a performance on a past day. */
  over: 'This performance is over.',
  overNextDates: 'This performance is over. Next dates →',
  share: 'Share',
  linkCopied: 'Link copied',
  /** An event that has started; its end is unknown or still ahead. */
  startedAt: (time: string) => `Started at ${time}`,
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
  // sticker on the popover photo
  peek: 'Preview',
  posterAlt: (title: string) => `Poster: ${title}`,
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
  title: 'Kulturprogramm — Theater, Oper, Tanz, Konzerte und Kino in NRW',
  description: 'Theater, Oper, Tanz, Konzerte und Kino in NRW auf einer Timeline. Tag wählen, Abend planen, Tickets holen.',
  toTop: 'Kulturprogramm — nach oben',
  language: 'Sprache',
  myEvening: 'Mein Abend',
  cat: {
    theatre: { label: 'Theater', tag: 'THEATER' },
    opera: { label: 'Oper', tag: 'OPER' },
    dance: { label: 'Tanz', tag: 'TANZ' },
    concerts: { label: 'Konzert', tag: 'KONZERT' },
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
  months: MONTHS_DE,
  monthsLong: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],

  later: 'SPÄTER',
  until: date => `BIS ${date}`,
  shows: n => `${n} ${n === 1 ? 'Termin' : 'Termine'}`,
  laterHead: (from, to) => `SPÄTER ${from}–${to}`,
  showsAhead: n => `${n} ${n === 1 ? 'TERMIN' : 'TERMINE'}.`,
  nothingAnnounced: 'NOCH NICHTS ANGEKÜNDIGT.',
  saved: n => `${n} GEMERKT`,
  hintSeasonTimeline: 'Jedes Quadrat ist eine Vorstellung. Tippe darauf für Details, Tickets oder zum Merken.',
  hintSeasonPoster: 'Eine Karte pro Produktion, mit der nächsten Vorstellung. Mit dem Lesezeichen merkst du sie dir.',
  seasonLabel: 'Vorstellungen der nächsten Monate nach Spielstätte und Produktion',
  seasonEmpty: 'In diesen Kategorien ist noch nichts angekündigt.',
  inLater: 'Gemerkt',
  save: 'Vorstellung merken',
  productionsCount: n => `${n} ${n === 1 ? 'Produktion' : 'Produktionen'} · nächste Vorstellung in diesem Monat`,
  nextShow: (when, more, until) => `NÄCHSTE ${when}${more ? ` · +${more} BIS ${until}` : ''}`,
  saveNext: title => `Nächste Vorstellung merken: ${title}`,
  removeNext: title => `Nächste Vorstellung entfernen: ${title}`,
  laterPanel: 'DEINE SPÄTEREN ABENDE',
  laterSum: (n, evenings) => `${n} GEMERKT · ${evenings} ${evenings === 1 ? 'ABEND' : 'ABENDE'}`,
  laterEmpty: 'Tippe auf eine Vorstellung, um sie dir zu merken. Theater und Oper sind oft Wochen vorher ausverkauft, deshalb steht der Ticket-Link gleich daneben.',

  categoriesGroup: 'Kategorien (eine oder mehrere)',
  viewGroup: 'Ansicht',
  timeline: 'Timeline',
  poster: 'Poster',
  read: 'Lesen',
  readSortDay: 'Kontext zu allem, was an diesem Tag läuft, nach Uhrzeit.',
  readSortLater: 'Kontext zu allem, was in diesem Zeitraum läuft, nach nächstem Termin.',
  readAi: 'Recherchiert und geschrieben von einer KI. Alle Angaben ohne Gewähr – verbindlich ist die Website der Spielstätte.',
  readNew: 'NEU',
  readMore: n => n ? `Termine & Tickets (+${n})` : 'Termine & Tickets',
  readEmpty: 'Zu dieser Auswahl hat der Souffleur noch nichts.',
  readSave: 'Merken',
  inEvening: n => `${n} FÜR DEINEN ABEND`,
  hintTimeline: 'Tippe auf ein Event für Details, Tickets oder um es deinem Abend hinzuzufügen.',
  hintPoster: 'Merk dir ein Event vor, um es deinem Abend hinzuzufügen.',
  inFocus: 'IM FOKUS',
  updated: when => `Stand: ${when} · täglich aktualisiert`,
  demo: 'DEMO-PROGRAMM — erfundene Zeiten und Titel; Links führen zu den Startseiten der Spielstätten. Setze PGPASSWORD_FILE, um die Datenbank zu laden.',
  keyZoom: 'auf dem Tagesstreifen ziehen zum Zoomen · klicken, um die Ansicht zu verschieben · die Zeitleiste seitlich ziehen oder scrollen, um durch den Tag zu gehen',
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
  moreDates: n => `+${n} ${n === 1 ? 'weiterer Termin' : 'weitere Termine'}`,
  otherDates: 'WEITERE TERMINE',
  calendarLabel: 'Vorstellungen in zwei Wochen',
  calendarMonthsLabel: 'Vorstellungen pro Monat',
  calDays: from => `2 WOCHEN AB ${from}`,
  calMonths: from => `7 MONATE AB ${from.toUpperCase()}`,
  closeDates: 'Termine schließen',
  openDate: when => `${when} öffnen`,
  context: 'Kontext',
  contextHead: 'KONTEXT',
  aiGenerated: 'KI-GENERIERT, KANN FEHLER ENTHALTEN',
  closeContext: 'Kontext schließen',
  souffleur: 'Der Souffleur',
  souffleurAbout: 'Sitzt vorn an der Bühne und flüstert, was man wissen sollte.',
  ticket: 'Das Ticket',
  ticketAbout: 'Kommt in jeden Film und weiß, worum es geht.',
  contextNothing: [
    'Hab gesucht. Nichts gefunden, was nicht schon im Programm steht.',
    'Ehrlich: Zu diesem Abend weiß ich auch nicht mehr als das Programmheft.',
    'Keine Preise, keine Skandale, keine Anekdoten. Manchmal ist ein Abend einfach ein Abend.',
  ],

  inYourEvening: 'In deinem Abend',
  alreadyOver: 'Schon vorbei',
  over: 'Diese Vorstellung ist vorbei.',
  overNextDates: 'Diese Vorstellung ist vorbei. Nächste Termine →',
  share: 'Teilen',
  linkCopied: 'Link kopiert',
  startedAt: time => `Begann um ${time}`,
  overlaps: names => `überschneidet sich mit ${names}`,
  mayOverlap: names => `überschneidet sich vielleicht mit ${names}`,
  clashWithPlan: text => `${cap(text)} in deinem Abend`,

  timelineLabel: 'Timeline der Events nach Spielstätte',
  wholeDay: 'DEN GANZEN TAG',
  onAtOnce: 'ist etwas los',
  dragToZoom: 'ziehen zum Zoomen',
  now: 'jetzt',
  running: (n, parts) =>
    `${n} ${n === 1 ? 'läuft' : 'laufen'}${parts.length ? ': ' + parts.map(([label, k]) => `${k} ${label}`).join(', ') : ''}`,
  stripHint: 'klicken, um die Ansicht hierher zu verschieben · ziehen, um einen Bereich zu zoomen',
  nothingInView: 'In diesem Teil des Tages ist nichts los — verschieb die Ansicht oben auf dem Tagesstreifen.',

  posterEmpty: 'An diesem Tag ist in diesen Kategorien nichts mehr los. Probier einen anderen Tag.',
  detailsFor: title => `Details zu ${title}`,
  peek: 'Vorschau',
  posterAlt: title => `Plakat: ${title}`,
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
