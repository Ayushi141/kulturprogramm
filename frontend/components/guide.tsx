'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Bookmark, ChartGantt, Clapperboard, Drama, LayoutGrid, MicVocal, X } from 'lucide-react'
import { CATEGORIES, type Category, type Programme } from '@/lib/types'
import { byStart, indexProgramme, spanLabel, toggle, upcoming, type Item, type Window } from '@/lib/plan'
import { cultureDay, dayLabel, fmt, shiftDate, stamp, weekday } from '@/lib/time'
import { DICTS, type Lang } from '@/lib/i18n'
import { LangProvider } from './i18n'
import { Masthead } from './masthead'
import { Picture } from './picture'
import { CAT } from './explorer/categories'
import { DayStrip } from './explorer/day-strip'
import { PosterView, SeasonPoster } from './explorer/poster-view'
import { LaterPanel, PlanPanel } from './explorer/plan-panel'
import { SeasonTimeline } from './explorer/season-timeline'
import { HalftoneField } from './explorer/halftone-field'
import { CropMarks } from './crop-marks'
import { relation, Timeline } from './explorer/timeline'

type View = 'timeline' | 'poster'
type Now = { day: string; min: number }

const ICONS: Record<Category, typeof Drama> = { theatre: Drama, opera: MicVocal, movies: Clapperboard }
const STORE = 'kulturprogramm.plans.v1'
/** Day buttons in the strip; the "later" button covers the rest of the horizon. */
const STRIP_DAYS = 7
/** Days ahead that the frontend shows (getProgramme() loads as many). */
const HORIZON_DAYS = 183
/** Value of `day` when the "later" button is selected. */
const LATER = 'later'
/** Where an evening starts: the plan panel suggests events from here on. */
const EVENING: Window = [17 * 60, 25 * 60]
/** What the timeline shows after a page load: afternoon to evening, 15:00–21:30. */
const DEFAULT_WIN: Window = [15 * 60, 21 * 60 + 30]

export default function Guide({ programme, lang }: { programme: Programme; lang: Lang }) {
  return <LangProvider lang={lang}><GuideBody programme={programme} lang={lang} /></LangProvider>
}

function GuideBody({ programme, lang }: { programme: Programme; lang: Lang }) {
  const t = DICTS[lang]
  const byDay = useMemo(() => indexProgramme(programme), [programme])
  const itemById = useMemo(() => new Map([...byDay.values()].flat().map(i => [i.id, i])), [byDay])

  const [now, setNow] = useState<Now | null>(null) // client only: avoids a server/client clock mismatch
  const [day, setDay] = useState('')
  const [cats, setCats] = useState<Set<Category>>(new Set(CATEGORIES))
  const [win, setWin] = useState<Window>(DEFAULT_WIN) // what the timeline shows; nothing else depends on it
  const [plans, setPlans] = useState<Record<string, string[]>>({})
  const [view, setViewState] = useState<View>('timeline')
  const [detail, setDetail] = useState<Item | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const loaded = useRef(false)

  /* clock, initial day and view, saved plans */
  useEffect(() => {
    const n = cultureDay(new Date())
    setNow(n); setDay(n.day)
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, string[]>
      setPlans(Object.fromEntries(Object.entries(saved).filter(([d]) => d >= n.day)))
    } catch { /* storage unavailable: start empty */ }
    loaded.current = true
    const fromHash = () => { const v = location.hash.slice(1); if (v === 'poster' || v === 'timeline') setViewState(v) }
    fromHash()
    const t = setInterval(() => setNow(cultureDay(new Date())), 60000)
    addEventListener('hashchange', fromHash)
    return () => { clearInterval(t); removeEventListener('hashchange', fromHash) }
  }, [])
  useEffect(() => { if (loaded.current) try { localStorage.setItem(STORE, JSON.stringify(plans)) } catch { /* ignore */ } }, [plans])
  useEffect(() => { if (detail) dialog.current?.showModal(); else dialog.current?.close() }, [detail])

  const setView = (v: View) => { setViewState(v); try { history.replaceState(null, '', '#' + v) } catch { /* ignore */ } }
  const flipCat = (c: Category) => setCats(cs => {
    const next = new Set(cs)
    if (next.has(c)) next.delete(c); else next.add(c)
    return next.size ? next : cs // at least one category stays on
  })

  /* derived state */
  const days = useMemo(() => (now ? Array.from({ length: STRIP_DAYS }, (_, i) => shiftDate(now.day, i)) : []), [now?.day])
  const laterFrom = now ? shiftDate(now.day, STRIP_DAYS) : '', laterTo = now ? shiftDate(now.day, HORIZON_DAYS - 1) : ''
  const isLater = day === LATER
  const nowMin = now && day === now.day ? now.min : null
  const inCat = (it: Item) => cats.has(it.category)
  /** Picked items of one day, in time order. */
  const planFor = (d: string) => (plans[d] ?? []).map(id => itemById.get(id)).filter((i): i is Item => !!i && i.day === d).sort(byStart)
  /* the "later" range: everything after the strip, up to the horizon */
  const laterItems = useMemo(() => [...byDay].filter(([d]) => d >= laterFrom && d <= laterTo).flatMap(([, its]) => its), [byDay, laterFrom, laterTo])
  const laterPool = laterItems.filter(inCat)
  const laterPicks = Object.keys(plans).filter(d => d >= laterFrom).sort().flatMap(planFor)
  const laterIds = new Set(laterPicks.map(i => i.id))
  const laterVisible = [...laterPool, ...laterPicks.filter(i => !inCat(i))]
  const laterWeekly = laterFrom ? Array.from({ length: Math.ceil((HORIZON_DAYS - STRIP_DAYS) / 7) }, (_, w) => {
    const a = shiftDate(laterFrom, w * 7), b = shiftDate(laterFrom, w * 7 + 6)
    return laterPool.filter(i => i.day >= a && i.day <= b).length
  }) : []
  const dayItems = byDay.get(day) ?? []
  const plan = isLater ? [] : planFor(day)
  const planIds = new Set(plan.map(i => i.id))
  const pool = dayItems.filter(inCat)
  const visible = [...pool, ...plan.filter(i => !inCat(i))]
  const ahead = visible.filter(i => upcoming(i, nowMin) || planIds.has(i.id))
  const started = visible.length - ahead.length
  const countOf = (d: string) => (byDay.get(d) ?? []).filter(i => inCat(i) && upcoming(i, d === now?.day ? now.min : null)).length
  // "In focus" shows whatever day or categories are selected: a performance on the
  // selected day if there is one, otherwise the next upcoming one
  const featured = new Set(programme.featured ?? [])
  const focusAll = featured.size && now ? [...byDay.keys()].filter(d => d >= now.day).sort().flatMap(d => (byDay.get(d) ?? [])
    .filter(i => featured.has(i.ev.title) && upcoming(i, d === now?.day ? now.min : null)).sort(byStart)) : []
  const focus = focusAll.find(i => i.day === day) ?? focusAll[0]
  const suggestion = ahead.filter(i => i.s >= EVENING[0]).sort((a, b) => a.s - b.s)[0] ?? ahead[0]

  /** Adds or removes a performance on its own day (not the selected one). */
  const onToggle = (id: string) => {
    const it = itemById.get(id)
    if (it) setPlans(ps => ({ ...ps, [it.day]: toggle(planFor(it.day).map(i => i.id), id) }))
  }
  const pickCount = Object.values(plans).reduce((n, ids) => n + ids.length, 0)
  const showPicks = () => {
    if (!isLater && !plan.length) {
      const d = days.find(x => planFor(x).length)
      if (d) setDay(d); else if (laterPicks.length) setDay(LATER)
    }
    setTimeout(() => document.getElementById('my-evening')?.scrollIntoView({ behavior: 'smooth' }), 50)
  }


  let hint: React.ReactNode = null
  if (now && day) {
    hint = isLater
      ? <>{laterPicks.length > 0 && <><b>{t.saved(laterPicks.length)}</b> </>}{view === 'timeline' ? t.hintSeasonTimeline : t.hintSeasonPoster}</>
      : <>{plan.length > 0 && <><b>{t.inEvening(plan.length)}</b> </>}{view === 'timeline' ? t.hintTimeline : t.hintPoster}</>
  }
  // the detail dialog relates an event to the picks of its own day
  const detailPlan = detail ? planFor(detail.day) : []
  const detailIds = new Set(detailPlan.map(i => i.id))
  const rel = detail ? relation(detail, detailPlan, detailIds, detail.day === now?.day ? now.min : null, t) : null
  const detailPicked = !!detail && detailIds.has(detail.id)

  return (
    <main id="top">
      <Masthead count={pickCount} showPicks={showPicks} />
      {!now || !day ? <p className="x-wrap x-empty">{t.loading}</p> : <>
        {/* the headline is the answer: which day, how much is on */}
        <section className="x-hero">
          <div className="x-wrap trim">
            {/* printer's proof details: crop marks at the corners, colour bar on the blue bar */}
            <CropMarks />
            <HalftoneField />
            <div className="x-herorow">
              {isLater
                ? <h1>{t.laterHead(dayLabel(laterFrom), dayLabel(laterTo))}<br /><em>{laterPool.length ? t.showsAhead(laterPool.length) : t.nothingAnnounced}</em></h1>
                : <h1>{t.dateline(nowMin !== null ? t.today : t.wdl[weekday(day)].toUpperCase(), dayLabel(day))}<br />
                    <em>{ahead.length ? (nowMin !== null ? t.toCome : t.on)(ahead.length) : t.nothingOn}</em></h1>}
              {focus && (
                <button className="feature x-focus" onClick={() => setDetail(focus)} aria-label={t.detailsFor(focus.ev.title)}>
                  <Picture image={focus.ev.image} category={focus.category} key={focus.id} />
                  <span className="featuretop">{t.inFocus} / {t.cat[focus.category].tag}</span>
                  <span className="featurecap">
                    <small>{t.dateline(t.wdl[weekday(focus.day)].toUpperCase(), dayLabel(focus.day))}, {fmt(focus.s)} · {focus.venue.name}</small>
                    <strong>{focus.ev.title}</strong>
                    <ArrowUpRight size={22} />
                  </span>
                </button>
              )}
            </div>
            <DayStrip days={days} selected={day} win={win} onSelect={setDay} countOf={countOf} itemsOf={d => (byDay.get(d) ?? []).filter(inCat)}
              later={{ key: LATER, until: laterTo, count: laterPool.length, weekly: laterWeekly }} />
            <span className="x-colorbar" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span>
          </div>
        </section>

        {/* sticky control bar: stays in reach while you scroll the programme */}
        <div className="x-band">
          <div className="x-wrap x-bandrow">
            <div className="filters x-cats" aria-label={t.categoriesGroup}>
              {CATEGORIES.map(c => {
                const Icon = ICONS[c]
                return <button key={c} aria-pressed={cats.has(c)} onClick={() => flipCat(c)}><i className="x-sw" style={{ background: CAT[c].color }} /><Icon size={15} />{t.cat[c].label}</button>
              })}
            </div>
            <i className="x-star" aria-hidden="true" />
            <div className="x-views" role="group" aria-label={t.viewGroup}>
              <button aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}><ChartGantt size={16} />{t.timeline}</button>
              <button aria-pressed={view === 'poster'} onClick={() => setView('poster')}><LayoutGrid size={16} />{t.poster}</button>
            </div>
          </div>
        </div>

        <section className="directory" id="guide">
          {programme.demo && <p className="x-demo">{t.demo}</p>}
          <p className="x-hint">{hint}</p>
          {programme.updatedAt && <p className="x-updated">{t.updated(stamp(new Date(programme.updatedAt)))}</p>}

          {isLater ? (view === 'timeline'
            ? <SeasonTimeline venues={programme.venues} items={laterVisible} from={laterFrom} to={laterTo} planIds={laterIds} onToggle={onToggle} />
            : <SeasonPoster items={laterVisible} planIds={laterIds} onToggle={onToggle} onOpen={setDetail} />
          ) : view === 'timeline' ? <>
            <Timeline venues={programme.venues} items={visible} overviewItems={pool} win={win} nowMin={nowMin}
              plan={plan} planIds={planIds} onToggle={onToggle} onWindow={setWin} />
            <div className="x-key">
              <span>{t.keyZoom}</span>
            </div>
          </> : (
            <PosterView items={ahead} started={started} plan={plan} planIds={planIds} onToggle={onToggle} onOpen={setDetail}
              onTimeline={() => setView('timeline')} emptyText={t.posterEmpty} />
          )}

          {isLater
            ? <LaterPanel items={laterPicks} onToggle={onToggle} />
            : <PlanPanel day={day} plan={plan} suggestion={suggestion} onToggle={onToggle} onClear={() => setPlans(ps => ({ ...ps, [day]: [] }))} />}
        </section>
      </>}
      <footer><span className="brand x-footbrand"><span className="burst" aria-hidden="true" />KULTURPROGRAMM</span> <span>{t.footer}</span></footer>

      <dialog ref={dialog} aria-label={detail?.ev.title || t.details} onCancel={() => setDetail(null)} onClick={e => { if (e.target === dialog.current) setDetail(null) }}>
        <div className="dialogbody">
          <button className="dismiss" onClick={() => setDetail(null)} aria-label={t.close}><X size={18} /></button>
          {detail && <>
            <div className="detailphoto"><Picture image={detail.ev.image} category={detail.category} key={detail.id} /></div>
            <small>{t.cat[detail.category].tag} / {t.dateline(t.wdl[weekday(detail.day)].toUpperCase(), dayLabel(detail.day))}</small>
            <h2>{detail.ev.title}</h2>
            <p><b>{detail.venue.name}</b> · {detail.venue.city}<br />{spanLabel(detail, t)}{detail.ev.price && ` · ${detail.ev.price}`}</p>
            {detail.ev.note && <p>{detail.ev.note}</p>}
            {rel && <p className={rel.strong ? 'x-rel' : 'x-rel x-rel-muted'}>{rel.text}</p>}
            <div className="x-dialogbtns">
              {detail.ev.url && <a className="visit" href={detail.ev.url} target="_blank" rel="noopener noreferrer">{t.tickets} <ArrowUpRight size={18} /></a>}
              <button className="visit x-outline" onClick={() => { onToggle(detail.id); setDetail(null) }}>
                <Bookmark size={16} fill={detailPicked ? 'currentColor' : 'none'} />{detailPicked ? t.remove : t.add}</button>
            </div>
          </>}
        </div>
      </dialog>
    </main>
  )
}
