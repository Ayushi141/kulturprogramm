# Scrapers

Details for work on `backend/scraper/main.py`: the code model, the rules for a new or changed
source, and how each source reads its website. The general notes (database, logging, deploy) are in
[`AGENTS.md`](../AGENTS.md).

## Code model

All scraper classes and the run loop are in `backend/scraper/main.py`.

- `Category` is a `StrEnum`: `FILM = "film"`, `THEATER = "theater"`, `OPER =
  "oper"`, `CONCERT = "konzert"`, and `TANZ = "tanz"` (ballet and dance
  theatre). These values are written to the database; add new ones to the `category` check in `init.sql`, `CATEGORY` in
  `frontend/lib/get-programme.ts`, and every `Record<Category, …>` the type
  checker then flags (colour, labels, icon, typical length, `.cat-*` fallback).
- A `Source` is one website (`name`, `website`, `organizer`: who hosts its events, written out in
  full; `None` when each `Event.organizer` says it, as for the four Filmkunstkinos); a `Venue` (`name`, `city`) is one physical place. One source can list several venues
  (Filmkunstkinos lists four cinemas). Write a venue's name the same way in every event. A house
  orchestra (`ORCHESTRA`) organizes its branch's events itself (KR-MG, Wuppertal, Essen, Dortmund).
- `Event`: `title`, `venue`, `category`, aware `starts_at`, optional aware `ends_at`, absolute `url`,
  `organizer` (else the source's), `image_url` (set by `scrape()`), `image_key` (set by `add_images()`).
- `Source` stores a key and URL; its abstract `scrape()` fetches and parses
  events, and `save()` upserts new images, productions, then the events.
- Images: `Source.scrape_image(event)` returns an image URL or `None`; the default returns
  `event.image_url`, else the `og:image` of `event.url`. `Source.add_images(events)` calls it once per
  title and stores the original bytes (Pillow checks the format; over `MAX_SIDE` 1200 px shrunk to JPEG,
  PNG if transparent), keyed by a hash of the bytes. It never raises: a failure is a warning, the event
  keeps no image. A production's stored image (same source and title) is reused, so a run only looks up
  new productions. After lowering `MAX_SIDE`, run `shrink_stored()` once (new keys, same productions).
- The run loop scrapes each source, adds images, saves, logs which sources failed, sleeps one day.
  A raising source is logged with its traceback; the others continue.
## Implementation rules

- Make datetimes aware using `ZoneInfo("Europe/Berlin")`.
- Use `%s` placeholders in SQL. Do not interpolate values into SQL strings.
- Set an HTTP timeout; the current scrapers use `timeout=60`. Sites that
  answer 403 to httpx get `User-Agent: Mozilla/5.0`, as `download_image()` sends.
- Let parse errors surface instead of silently dropping malformed records;
  the run loop logs them per source. Images are the exception: they are
  optional, so image errors never stop an event from being saved.
- Store public performances and concerts. Skip cancelled cards by the site's
  marker, then classify with `self.event_category(default, *texts)` (on
  `Source`, with its word lists as class attributes) on short texts
  (title, label, badge, subtitle; never descriptions): `CLOSED` (school, Kita)
  skips, `CONCERT` words give `CONCERT`, `NON_PERFORMANCE` words (Führung,
  Workshop, Lesung, Gespräch, Matinee, Party) skip. Prefer page structure;
  keep the word lists generic, never per event. `+ Einführung` is ignored.
  Cinemas use `self.screening_category(title, *labels)` instead, which skips
  nothing: genre/series labels matching `DANCE_LABEL`/`OPERA_LABEL` give
  `TANZ`/`OPER` (never titles), a `CONCERT` word gives `CONCERT`, else `FILM`.
- Pass `category.value` to PostgreSQL.
- Use built-in generic types such as `list[Event]` in type hints.

## Naming

- Use the source's name in ASCII CapWords for its class. Write `oe` for `ö`;
  for example, `SchauspielKoeln`.
- Use a lowercase key for the `Source` name argument, such as
  `"schauspiel-koeln"`.
- The event's `venue` should identify the performance location, not the website operator
  (that is the `organizer`). Check the source page for available location information.

## Sources

The notes below describe the parser implementation. They are not a guarantee that a venue's live
page has not changed. Rheinisches Landestheater is not registered: no dated events yet.

### Filmkunstkinos
- `https://filmkunstkinos.de/programm/`: one `article.col-group` per film and cinema. Title: direct
  text of `h2.movie-small--title a` (`find(string=True, recursive=False)` drops `span.extended-title`);
  URL: its `href`. Venue `span.meta-theater-logo` (`Metropol`, `Bambi`, `Cinema`, `Atelier`) in
  Düsseldorf. Each `time[datetime]` is a screening labelled `+00:00` but local: replace the timezone,
  do not convert. End: start plus `.movie-small--meta p.meta` (`100 Min`, without trailers). Labels:
  the genres before its first `•`.

### Dhaus (Düsseldorfer Schauspielhaus)
- `https://www.dhaus.de/programm/spielplan/schauspiel`: one `div.performance` each. Title
  `.performance__title [itemprop=name]` without soft hyphens, its link made absolute. Start: naive
  `meta[itemprop=startDate]`; end only from `.performance__time` (`19:00 – 20:15`), moved to the next
  day if not after the start. Venue: the stage of `.performance__location` ("Schauspielhaus, Großes Haus"); city after the postal code in
  the hidden `[itemprop=location] [itemprop=address]`. Cancelled cards are skipped; title and
  `.performance__infos .performance__text` are classified, default `THEATER`.

### Schauspiel Köln
- `https://www.schauspiel.koeln/kalender`: one `li.s-bko-activity` each. Title and link
  `.field--name-production a`; start: date of `time.s-bko-activity__datetime[datetime]` plus its last
  text piece (`"%Y-%m-%d %H.%M Uhr"`). `production(url)` reads each production page once per run:
  stage `.field--name-stages` in Köln (several or none: general `VENUE` Schauspiel Köln), length
  `.field--name-duration` (`1 h 45 min`, `5 h`; missing for about a third, unknown formats logged),
  `og:image`. A failing page is logged; its events keep the general venue, no end or image. Label
  `.field--name-category` is classified with the title, default `THEATER`; `Entfällt` is skipped.

### Deutsche Oper am Rhein (Düsseldorf and Duisburg)
- `…/spielplan/kalender/<city>/` per `HOUSES` entry: `div.performance` at the main house (Opernhaus
  Düsseldorf, Theater Duisburg) with a `.performance__category` (tours have none), default `TANZ` for
  `Ballett`, else `OPER`. Cards give title/link, start, optional end.

### Theater Krefeld-Mönchengladbach
- `https://theater-kr-mg.de/kalender/` (`article.performance`): the first listed branch in `BRANCHES`
  gives the default category; `Extras` keeps only concerts. Cards provide title, URL, start; no end.
  Venue: the stage of `.performance__location` ("building – stage", seating notes dropped), else the
  building ("Seidenweberhaus"); city from the address on the linked directions page (none: `SEAT`,
  Krefeld).

### Oper Wuppertal
- `https://api.wb.c4c.it/api/performances`, JSON-LD Accept, all pages (at most 50 items each). Keep
  Oper at Opernhaus (`OPER`) and all Sinfonieorchester concerts; API gives title, URL, venue, times.
  Image: `production.image.src` of `/api/performances/<id>` (id ends the page URL; not in the list).

### Theater und Philharmonie Essen
- `https://www.theater-essen.de/programm/kalender/` (`div.performance`): the first category in
  `CATEGORIES` (Schauspiel, Aalto, Philharmonie) gives the default; `Treffpunkt:` locations (tours) are
  skipped and the ticket line marks closed shows. Cards provide title/times/venue.

### Oper Köln
- `https://www.oper.koeln/programm` (`li.s-bko-activity--schedule`): cards provide label, local times
  and production links; the info line marks Kita bookings. Venue Oper Köln, default `OPER`; image:
  `og:image` of the link.

### Schauspielhaus Bochum
- Read `/de/spielplan/11/tanz` (`TANZ`), then `/de/spielplan/13/schauspiel` (`THEATER`, also lists
  dance; first listing wins). `.schedule__group`/`.schedule__item` give date/title/stage/times; skip
  Theater Hagen, `Fällt aus`. Image (no og:image): inline background of `.production__title-image`, else
  first `img.lazyimage[data-src]`.

### Pina Bausch
- `https://www.pina-bausch.de/de/calendar`: season JSON in `data-page`. Keep Wuppertal dates whose event
  links played pieces (`plays`); labs and classes link none. `TANZ`, UTC times, no end; image from the
  event page JSON.

### UFA Palast Düsseldorf
- `https://ufa-duesseldorf.de/programm/`: every announced day (presales months ahead) as
  `section.day-section`, one `article.movie-row` per film: title `h2` in `a.group` (the film page),
  runtime in the div after it (`2 Std 39 Min`, `2 Std`, `95 Min`), poster `img`. Each
  `.showtime-wrap[data-date][data-time]` is a screening; screens (`Kino 13`) are halls of venue `UFA
  Palast Düsseldorf`. Labels: the row's `.prog-badge`s (`MET Opera`). `#all-movies-view` repeats all.

### UCI Kinowelt Düsseldorf
- `https://www.uci-kinowelt.de/kinoprogramm/duesseldorf/50` (`/day` shows only today): one
  `div.film-container` per film, title link `h2.film-container__description__text__eventtitle a`,
  `159min` in `ul.film-info` (missing for unreleased films), poster `img.film-thumb`; screenings
  `a.badge-performance[data-date="20261120"][data-time]`. Venue `UCI Kinowelt Düsseldorf`; labels: the `ul.film-info`
  genres (`Oper`, `Ballett`). Page and posters need a browser User-Agent. Both cinemas date
  after-midnight screenings by calendar day (UFA's ticket page: "Mittwoch, 16.12.26 00:05").

### Filmmuseum Düsseldorf
- `https://filmmuseum-duesseldorf.de/black-box-kino/kinoprogramm` ("Black Box" is the program), pages via
  "Weiter" (`#` on the last). `div.event-item`: `p.mb-0` date without year ("Sa 28.11.": this or next year,
  whichever has that weekday), time, link `a.mb-2`; series in its path. Film page: "· 83 min ·", og:image.

### Theater Dortmund
- `/kalender/`, pages via "»": `div.event`, start `data-start` (Unix; 0: school bookings, skipped;
  `data-endtime` is a fixed +6 h), end from the "19:00 Uhr – 22:00 Uhr" line. Skips KJT, mobile shows,
  `ELSEWHERE` guests. Image: no og:image; last (widest) `#tx-ra-eventim-header-*` CSS background.

### Tonhalle Düsseldorf
- `https://www.tonhalle.de/api/events?type=dynamic&size=500&from=N` (upcoming events, pages by `nextOffset`):
  per event several `isoDateStrings` (UTC) with one ticket id each (`projectEventEvisIds`, same order);
  `/api/events/metadata` gives each id's state (`CANCELLED`, `POSTPONED`: skipped). The series is the
  second link part; `komet` (guest promoters: pop tours, comedy, readings) is skipped. The event page's
  `script[data-page]` JSON names the hall (`iconTextList`, icon `marker`) and the share image
  (`meta.ogImage`; no og:image tag). `CONCERT`, no end.

### Kölner Philharmonie
- `https://www.koelner-philharmonie.de/de/api/events/?date=<today>` (10 per page, `next`): genres, room
  with venue and city, aware `date_start`/`date_end`, image `header_image_thumbs.og_image`. Genres
  „Sonstiges (Lesungen, Kabarett)“ and „Begleitprogramm“ are skipped; Tanz gives `TANZ`, Oper/Operette
  `OPER`, else `CONCERT`. Page: `/de/konzerte/<slug.de>/<id>`.

### Konzerthaus Dortmund
- `https://www.konzerthaus-dortmund.de/de/programm/` lists all announced events (`div.card.grid`).
  Only `div.card.kd` (the house's own productions) is kept: the guests include the Dortmunder
  Philharmoniker, which `TheaterDortmund` already reads. `p.genre`: „Konzertante Oper“ `OPER`, „Tanz &
  Show“ `TANZ`, „Musik & Dialog“ (tours, talks) skipped, else `CONCERT`. `.timebox li`: the date, then one
  item per start time („20.00 Uhr“). A ticket button „Verschoben …“/„Abgesagt“ skips the card. No end.
