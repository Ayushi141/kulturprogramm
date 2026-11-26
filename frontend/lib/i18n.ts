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
  laterSum: (n: number, evenings: number) => `${n} SAVED · ${evenings} ${evenings === 1 ? 'EVENING' : 'EVENINGS'}`,

  // control bar and hints
  categoriesGroup: 'Categories (choose one or more)',
  viewGroup: 'View',
  timeline: 'Timeline',
  poster: 'Poster',
  read: 'Context',
  readSortDay: 'What’s on this day, sorted by start time.',
  readSortLater: 'What’s on later, sorted by date.',
  readAi: 'Researched and written by AI.',
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
  imprint: 'Imprint',
  privacy: 'Privacy',
  backHome: 'Back to the programme',
  contactName: 'Name (optional)',
  contactEmail: 'Email (if you would like a reply)',
  contactMessage: 'Message',
  contactSend: 'Send',
  contactSent: 'Thank you. Your message has arrived.',
  contactFailed: 'That did not work. Please write an email instead.',
  contactNote: 'We store your message only to answer it, then delete it.',

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
  // the context drawer: a note by a narrator (NARRATOR in mascots.tsx)
  context: 'Context',
  contextHead: 'CONTEXT',
  /** Below a note the enricher wrote; the fixed lines are written by hand and carry no label. */
  aiGenerated: 'AI-GENERATED, MAY CONTAIN ERRORS',
  closeContext: 'Close context',
  /** The narrators of the context drawer (`NARRATOR` in mascots.tsx): name and one line about them. */
  narrator: {
    souffleur: { name: 'The Souffleur', about: 'Sits at the front of the stage and whispers what you should know.' },
    opernglas: { name: 'The Opera Glass', about: 'Looks closer than anyone else in the house.' },
    ticket: { name: 'The Ticket', about: 'Gets into every film and knows what it is about.' },
  },
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
  linkCopied: 'Copied',
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
  empty: 'EMPTY',
  emptyStart: 'Bookmark what you want to see',
  emptyExample: ' — for example ',
  at: (title: string, time: string) => `${title} at ${time}`,
  emptyEnd: '. Your picks show up here by day and time, with their ticket links.',
  overlapsBy: (min: number) => `overlaps by ${min} min`,
  backToBack: 'back to back',
  breakOf: (min: number) => `${min} min break`,
  mayOverlapShort: 'may overlap',
  copyPlan: 'Copy plan',
  copied: 'Copied',
  copyBlocked: 'Copy blocked',
}

export type Dict = typeof en

const de: Dict = {
  title: 'Kulturprogramm – Theater, Oper, Tanz, Konzerte und Kino in NRW',
  description: 'Theater, Oper, Tanz, Konzerte und Kino in NRW auf einer Timeline. Tag wählen, Abend planen, Tickets holen.',
  toTop: 'Kulturprogramm – nach oben',
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

  loading: 'Programm lädt …',
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
  hintSeasonTimeline: 'Jedes Quadrat ist eine Vorstellung. Antippen für Details, Tickets und zum Merken.',
  hintSeasonPoster: 'Pro Produktion eine Karte mit der nächsten Vorstellung. Mit dem Lesezeichen merkst du sie vor.',
  seasonLabel: 'Vorstellungen der nächsten Monate nach Spielstätte und Produktion',
  seasonEmpty: 'In diesen Kategorien ist noch nichts angekündigt.',
  inLater: 'Gemerkt',
  save: 'Vorstellung merken',
  productionsCount: n => `${n} ${n === 1 ? 'Produktion' : 'Produktionen'} · nächste Vorstellung in diesem Monat`,
  nextShow: (when, more, until) => `NÄCHSTE ${when}${more ? ` · +${more} BIS ${until}` : ''}`,
  saveNext: title => `Nächste Vorstellung merken: ${title}`,
  removeNext: title => `Nächste Vorstellung entfernen: ${title}`,
  laterSum: (n, evenings) => `${n} GEMERKT · ${evenings} ${evenings === 1 ? 'ABEND' : 'ABENDE'}`,

  categoriesGroup: 'Kategorien (Mehrfachauswahl)',
  viewGroup: 'Ansicht',
  timeline: 'Timeline',
  poster: 'Poster',
  read: 'Kontext',
  readSortDay: 'Was an diesem Tag läuft, nach Uhrzeit sortiert.',
  readSortLater: 'Was später läuft, nach Datum sortiert.',
  readAi: 'Recherchiert und geschrieben von einer KI.',
  readNew: 'NEU',
  readMore: n => n ? `Termine & Tickets (+${n})` : 'Termine & Tickets',
  readEmpty: 'Zu dieser Auswahl hat der Souffleur noch nichts.',
  readSave: 'Merken',
  inEvening: n => `${n} FÜR DEINEN ABEND`,
  hintTimeline: 'Event antippen für Details und Tickets – oder gleich zu deinem Abend hinzufügen.',
  hintPoster: 'Mit dem Lesezeichen kommt ein Event in deinen Abend.',
  inFocus: 'IM FOKUS',
  updated: when => `Stand: ${when} · täglich aktualisiert`,
  demo: 'DEMO-PROGRAMM – erfundene Zeiten und Titel; Links führen zu den Startseiten der Spielstätten. Setze PGPASSWORD_FILE, um die Datenbank zu laden.',
  keyZoom: 'Tagesleiste: ziehen zum Zoomen, klicken zum Verschieben · Timeline: seitlich ziehen oder scrollen, um durch den Tag zu gehen',
  footer: 'Programm und Bilder stammen von den Websites der Spielstätten.',
  imprint: 'Impressum',
  privacy: 'Datenschutz',
  backHome: 'Zurück zum Programm',
  contactName: 'Name (optional)',
  contactEmail: 'E-Mail (falls du eine Antwort möchtest)',
  contactMessage: 'Nachricht',
  contactSend: 'Senden',
  contactSent: 'Danke! Deine Nachricht ist angekommen.',
  contactFailed: 'Das hat nicht geklappt. Schreib uns bitte eine E-Mail.',
  contactNote: 'Wir speichern deine Nachricht nur, um sie zu beantworten, und löschen sie danach.',

  details: 'Programmdetails',
  close: 'Schließen',
  tickets: 'Tickets & Details',
  add: 'Zu meinem Abend hinzufügen',
  remove: 'Aus meinem Abend entfernen',
  removeShort: 'Entfernen',
  from: 'ab',
  endNotAnnounced: 'Ende nicht angegeben',
  open: 'offen',
  moreDates: n => `+${n} ${n === 1 ? 'weiterer Termin' : 'weitere Termine'}`,
  otherDates: 'WEITERE TERMINE',
  calendarLabel: 'Vorstellungen der nächsten zwei Wochen',
  calendarMonthsLabel: 'Vorstellungen pro Monat',
  calDays: from => `2 WOCHEN AB ${from}`,
  calMonths: from => `7 MONATE AB ${from.toUpperCase()}`,
  closeDates: 'Termine schließen',
  openDate: when => `${when} öffnen`,
  context: 'Kontext',
  contextHead: 'KONTEXT',
  aiGenerated: 'KI-GENERIERT',
  closeContext: 'Kontext schließen',
  narrator: {
    souffleur: { name: 'Der Souffleur', about: 'Sitzt vorn an der Bühne und flüstert, was man wissen sollte.' },
    opernglas: { name: 'Das Opernglas', about: 'Schaut genauer hin als alle anderen im Saal.' },
    ticket: { name: 'Das Ticket', about: 'Kommt in jeden Film und weiß, worum es geht.' },
  },
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
  linkCopied: 'Kopiert',
  startedAt: time => `Hat um ${time} begonnen`,
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
  stripHint: 'klicken zum Verschieben · ziehen zum Zoomen',
  nothingInView: 'Hier ist gerade nichts los. Verschieb den Ausschnitt oben in der Tagesleiste.',

  posterEmpty: 'In diesen Kategorien ist an diesem Tag nichts mehr los. Probier’s an einem anderen Tag.',
  detailsFor: title => `Details zu ${title}`,
  peek: 'Vorschau',
  posterAlt: title => `Plakat: ${title}`,
  addTo: title => `Zu meinem Abend hinzufügen: ${title}`,
  removeFrom: title => `Aus meinem Abend entfernen: ${title}`,
  starting: n => `${n} ${n === 1 ? 'beginnt' : 'beginnen'}`,
  startedToday: n => `${n} ${n === 1 ? 'weiteres hat' : 'weitere haben'} heute schon begonnen – `,
  seeOnTimeline: 'in der Timeline ansehen',

  empty: 'LEER',
  emptyStart: 'Merk dir vor, was du sehen willst',
  emptyExample: ' – zum Beispiel ',
  at: (title, time) => `${title} um ${time}`,
  emptyEnd: '. Hier stehen dann deine Abende der Reihe nach, mit Ticket-Links.',
  overlapsBy: min => `${min} Min. Überschneidung`,
  backToBack: 'direkt nacheinander',
  breakOf: min => `${min} Min. Pause`,
  mayOverlapShort: 'überschneidet sich vielleicht',
  copyPlan: 'Plan kopieren',
  copied: 'Kopiert',
  copyBlocked: 'Kopieren nicht möglich',
}

export const DICTS: Record<Lang, Dict> = { de, en }
