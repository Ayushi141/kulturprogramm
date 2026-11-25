"""
Writes the context notes for productions (the speech bubble in the card's
drawer). For each production that has upcoming dates and was not looked up
yet, the enricher sends one request through OpenRouter. The model searches
the web, reads the pages it finds and writes the note in German and English.
OpenRouter runs the search and the page fetches itself (its server tools),
so any model with tool calling works: change ENRICH_MODEL to switch.

The enricher writes only the columns note_de, note_en and enriched_at of
`productions`. The scraper writes the other columns.

Usage:
    python main.py                 # loop: look up new productions every few hours
    python main.py --once          # one batch, then stop
    python main.py --dry-run       # print the notes, do not write them
    python main.py --title Judas   # only productions whose title contains "Judas"
    python main.py --limit 5       # at most 5 productions per batch
"""

import argparse
import logging
import os
import sys
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from time import monotonic, sleep

import httpx
import psycopg

# a model slug from openrouter.ai/models; it needs tool calling
MODEL = os.environ.get("ENRICH_MODEL", "deepseek/deepseek-v4.1-flash")
# OpenAI-compatible Chat Completions. eu.openrouter.ai keeps requests in the EU.
API_URL = os.environ.get(
    "ENRICH_API_URL", "https://openrouter.ai/api/v1/chat/completions"
)
# productions per batch: the daily cost limit
BATCH = int(os.environ.get("ENRICH_BATCH", "30"))
# requests at the same time; the whole batch at once by default
PARALLEL = int(os.environ.get("ENRICH_PARALLEL", str(BATCH)))
# hours between batches
INTERVAL_HOURS = float(os.environ.get("ENRICH_INTERVAL_HOURS", "6"))
# OpenRouter runs both tools during the request. Results and fetched pages
# are input tokens, so the limits keep the cost per production low.
TOOLS = [
    {
        "type": "openrouter:web_search",
        # Parallel in turbo mode: the cheapest engine, short excerpts
        "parameters": {"engine": "parallel", "mode": "turbo", "max_uses": 5, "max_results": 3},
    },
    {
        "type": "openrouter:web_fetch",
        # a plain HTTP download, free; it does not run JavaScript
        "parameters": {"engine": "openrouter", "max_uses": 3, "max_content_tokens": 10000},
    },
]
# Which provider serves the model (many host DeepSeek): always the cheapest
# one that supports every parameter of the request, so tool calling too.
# Data collection is allowed: the notes are about public facts.
PROVIDER = {"sort": "price", "require_parameters": True}
# the answer when the model found nothing worth telling
NOTHING = "NICHTS"

SYSTEM = """\
Du bist der Souffleur von kulturprogramm.eu, einer Seite mit dem Kulturprogramm in NRW. \
Du arbeitest seit vierzig Jahren am Theater, kennst die Stücke, die Leute und die \
Geschichten dahinter, und du erzählst gern davon. Bei Filmen gilt dieselbe Stimme.

Deine Aufgabe: Recherchiere zu einer Produktion und schreib zwei bis vier Sätze, die \
neugierig machen. Such nach dem, was diesen Abend interessant macht.

Wo du suchst:
- Fang mit der Seite der Spielstätte an, wenn eine URL dabei ist.
- Dann zum Beispiel Wikipedia, nachtkritik.de, Bachtrack, Seiten von Festivals \
(Theatertreffen, Ruhrtriennale, Salzburger Festspiele), Künstlerseiten. Bei Filmen \
zum Beispiel TMDB, Wikipedia und Festivalseiten.
- Prüf, ob eine Person zu genau dieser Produktion gehört (Name und Rolle oder Haus), \
bevor du etwas über sie schreibst.

Worüber du schreibst, in dieser Reihenfolge:
1. Etwas über diese Produktion: ein wichtiger Preis einer beteiligten Person (zum \
Beispiel Faust-Preis, Nestroy-Preis, Gertrud-Eysoldt-Ring, Opus Klassik, Grammy, Oscar, \
Preise großer Festivals), eine Einladung zu einem Festival, eine Uraufführung, eine \
bekannte Regie, eine Koproduktion mit einem großen Festival.
2. Sonst etwas aus der Geschichte des Werks: die Uraufführung, ein Skandal, eine \
Anekdote.
3. Sonst eine ehrliche Einordnung, wenn sie belegt ist: zum Beispiel, dass das Werk zu \
den meistgespielten gehört.
4. Wenn du nichts davon findest, antworte nur mit dem Wort NICHTS.

Regeln für den Text:
- Nur Fakten, die du in deiner Recherche gefunden hast. Nichts erfinden, nichts aus \
dem Gedächtnis ergänzen.
- Keine Urteile über die Qualität der Inszenierung oder des Films. Die Haltung steckt \
im Tonfall und in der Auswahl der Fakten.
- Ton: lebendig, trocken, ein bisschen frech, mit kleinen Pointen. Du duzt die Leser. \
Keine Ausrufezeichen, keine Superlative, keine Werbesprache.
- Keine Tipps oder Anweisungen an das Publikum („Iss vorher was", „Plan den Abend \
ein"). Die Leser sind Erwachsene.
- Höchstens ein Name, und nur, wenn er etwas bedeutet (Preis, Bekanntheit).
- Keine Spoiler: nichts über Bühnenbild, Effekte oder Tricks, außer sie sind selbst \
der Aufhänger.
- Zeitangaben nur, wenn sie Lust machen (Premiere, Uraufführung). Nie, seit wann eine \
Produktion läuft. Keine Termine und keine Zahl der restlichen Vorstellungen.
- Schreib in eigenen Worten, übernimm keine Sätze aus den Quellen.

Antwortformat: der deutsche Text zwischen <de> und </de>, dann der englische Text \
zwischen <en> und </en>, im selben Ton neu geschrieben, nicht wörtlich übersetzt. \
Ohne Überschriften oder Quellen. Wenn du nichts gefunden hast: nur NICHTS.
"""

CATEGORY_DE = {
    "film": "Film",
    "theater": "Theater",
    "oper": "Oper",
    "konzert": "Konzert",
    "tanz": "Tanz",
}


# Every line: time, level, then "<production> | message" (see ctx()), like
# the scraper's log. stdout only, so tracebacks stay in order.
logging.basicConfig(
    stream=sys.stdout,
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("enricher")
CTX_WIDTH = 22


def ctx(label: str) -> str:
    """The prefix of a log line: a production title or "batch" in a fixed column."""
    return f"{label:<{CTX_WIDTH}.{CTX_WIDTH}} |"


def secret(name: str) -> str:
    """Reads the file that the environment variable `name` points to."""
    return Path(os.environ[name]).read_text().strip()


def connect() -> psycopg.Connection:
    return psycopg.connect(password=secret("PGPASSWORD_FILE"))


def pending(limit: int, title: str | None) -> list[tuple]:
    """
    Productions to look up: not looked up yet, with upcoming dates, the
    soonest first. Each row: id, title, category, organizer, venues, city, url.
    """
    with connect() as conn:
        return conn.execute(
            """
            SELECT p.id, p.title, p.category,
                   string_agg(DISTINCT e.organizer, ', '),
                   string_agg(DISTINCT e.venue, ', '),
                   min(e.city),
                   (array_agg(e.url ORDER BY e.starts_at) FILTER (WHERE e.url IS NOT NULL))[1]
            FROM productions p
            JOIN events e ON e.production_id = p.id
            WHERE p.enriched_at IS NULL
              AND e.starts_at > now()
              AND (%(title)s::text IS NULL OR p.title ILIKE '%%' || %(title)s || '%%')
            GROUP BY p.id
            ORDER BY min(e.starts_at)
            LIMIT %(limit)s
            """,
            {"limit": limit, "title": title},
        ).fetchall()


def ask(production: tuple, key: str) -> str:
    """
    Sends one production to the model and returns the text of the answer.
    OpenRouter runs the web searches and page fetches during the request.
    """
    _, title, category, organizer, venues, city, url = production
    started = monotonic()
    lines = [
        f"Titel: {title}",
        f"Sparte: {CATEGORY_DE.get(category, category)}",
        f"Veranstalter: {organizer}",
        f"Spielstätte: {venues}, {city}",
    ]
    if url:
        lines.append(f"Seite der Spielstätte: {url}")
    response = httpx.post(
        API_URL,
        headers={
            "Authorization": f"Bearer {key}",
            # attribution shown in the OpenRouter dashboard
            "HTTP-Referer": "https://kulturprogramm.eu",
            "X-Title": "kulturprogramm enricher",
        },
        json={
            "model": MODEL,
            "max_tokens": 16000,
            "messages": [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": "\n".join(lines)},
            ],
            "tools": TOOLS,
            "provider": PROVIDER,
        },
        timeout=600,
    )
    response.raise_for_status()
    body = response.json()
    choice = body["choices"][0]
    usage = body.get("usage", {})
    tools = usage.get("server_tool_use_details", {})
    log.info(
        f"{ctx(title)} {usage.get('prompt_tokens', 0)} in,"
        f" {usage.get('completion_tokens', 0)} out tokens,"
        f" {tools.get('web_search_requests', 0)} searches,"
        f" {tools.get('tool_calls_executed', 0)} tool calls,"
        f" ${usage.get('cost', 0):.3f}, {monotonic() - started:.0f} s,"
        f" via {body.get('provider', '?')}"
    )
    # "length": max_tokens reached, the note may be cut off
    if choice.get("finish_reason") not in ("stop", None):
        raise ValueError(f"answer ended early: {choice.get('finish_reason')}")
    return (choice["message"].get("content") or "").strip()


def parse(text: str) -> tuple[str | None, str | None]:
    """
    The German and English note from an answer: the text inside <de>…</de>
    and <en>…</en>. Text outside the markers is dropped, such as a sentence
    the model writes before it searches. NICHTS without markers gives two
    Nones. Raises ValueError when the answer has neither.
    """
    notes = [
        re.search(rf"<{lang}>(.*?)</{lang}>", text, flags=re.DOTALL)
        for lang in ("de", "en")
    ]
    if all(notes) and all(n.group(1).strip() for n in notes):
        return notes[0].group(1).strip(), notes[1].group(1).strip()
    if re.search(rf"\b{NOTHING}\b", text):
        return None, None
    raise ValueError(f"answer has no <de> and <en> note and no {NOTHING}: {text!r}")


def save(production_id: int, note_de: str | None, note_en: str | None) -> None:
    """Writes the notes. enriched_at marks the production as looked up."""
    with connect() as conn:
        conn.execute(
            """
            UPDATE productions
            SET note_de = %s, note_en = %s, enriched_at = now()
            WHERE id = %s
            """,
            (note_de, note_en, production_id),
        )


def enrich(production: tuple, key: str, dry_run: bool) -> str:
    """
    Looks up one production and saves its notes. Returns "note", "nothing"
    or "failed". A failed production stays not looked up, so the next batch
    tries it again. Runs in a worker thread: it logs, but never raises.
    """
    label = production[1]
    log.info(f"{ctx(label)} looking up at {production[4]}, {production[5]} ({production[3]})")
    try:
        note_de, note_en = parse(ask(production, key))
        if not dry_run:
            save(production[0], note_de, note_en)
    except ValueError as error:
        # an answer in the wrong format: no traceback, the answer says it all
        log.warning(f"{ctx(label)} tried again in the next batch: {error}")
        return "failed"
    except Exception:
        # the traceback follows on the next lines
        log.exception(f"{ctx(label)} failed, tried again in the next batch")
        return "failed"
    if not note_de:
        log.info(f"{ctx(label)} nothing found")
        return "nothing"
    log.info(f"{ctx(label)} DE {note_de}")
    log.info(f"{ctx(label)} EN {note_en}")
    return "note"


def run_batch(limit: int, title: str | None, dry_run: bool) -> None:
    """
    Looks up one batch of productions, PARALLEL requests at a time. The
    requests mostly wait for the API, so threads are enough. Each log line
    names its production, so the interleaved lines stay readable.
    """
    key = secret("OPENROUTER_API_KEY_FILE")
    productions = pending(limit, title)
    log.info(f"{ctx('batch')} {len(productions)} productions to look up,"
             f" {PARALLEL} at a time"
             + (" (dry run: nothing is saved)" if dry_run else ""))
    with ThreadPoolExecutor(max_workers=PARALLEL) as pool:
        results = list(pool.map(lambda p: enrich(p, key, dry_run), productions))
    log.info(
        f"{ctx('batch')} {results.count('note')} notes,"
        f" {results.count('nothing')} nothing found, {results.count('failed')} failed"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--once", action="store_true", help="one batch, then stop")
    parser.add_argument("--dry-run", action="store_true", help="print, do not write")
    parser.add_argument("--limit", type=int, default=BATCH, help="productions per batch")
    parser.add_argument("--title", help="only titles that contain this text")
    args = parser.parse_args()
    while True:
        run_batch(args.limit, args.title, args.dry_run)
        if args.once or args.dry_run:
            return
        log.info(f"{ctx('batch')} next batch in {INTERVAL_HOURS:g} h")
        sleep(INTERVAL_HOURS * 3600)


if __name__ == "__main__":
    main()
