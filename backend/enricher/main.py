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
from dataclasses import dataclass, field
from pathlib import Path
from threading import Lock
from time import monotonic, sleep

import httpx
import psycopg
from bs4 import BeautifulSoup

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
# The research budget per production. SYSTEM tells the model these numbers,
# so it can plan; TOOLS enforces them.
MAX_SEARCHES = 3
MAX_FETCHES = 3
# OpenRouter runs both tools during the request. Results and fetched pages
# are input tokens, and every later step reads them again, so the limits
# keep the cost per production low.
TOOLS = [
    {
        "type": "openrouter:web_search",
        # Parallel in turbo mode: $0.001 per search with up to 10 results, so
        # one wide search costs the same as a narrow one. max_characters: the
        # excerpt per result, the passages that match the query (about 750
        # tokens; Parallel's default is 1500 characters).
        "parameters": {
            "engine": "parallel",
            "mode": "turbo",
            "max_uses": MAX_SEARCHES,
            "max_results": 8,
            "max_characters": 3000,
        },
    },
    {
        "type": "openrouter:web_fetch",
        # Parallel's extract API: the text of the page, not its HTML ($0.001 per
        # page). The free "openrouter" engine passed raw HTML through
        # (Wikipedia: 10,000 tokens of menu before the article began).
        "parameters": {"engine": "parallel", "max_uses": MAX_FETCHES, "max_content_tokens": 30000},
    },
]
# The venue page goes into the request as text (venue_text()): some venues
# block OpenRouter's download (theater-oberhausen.de: 403), and the model
# gets its best source before the first step. The whole visible text, menus
# included; the limit only stops a runaway page (about 15,000 tokens).
VENUE_CHARS = 60000
# one venue download at a time: a batch often holds many productions of one site
VENUE_LOCK = Lock()
# Which provider serves the model (many host DeepSeek): always the cheapest
# one that supports every parameter of the request, so tool calling too.
# Data collection is allowed: the notes are about public facts.
PROVIDER = {"sort": "price", "require_parameters": True}
# the answer when the model found nothing worth telling
NOTHING = "NICHTS"

SYSTEM = f"""\
Du bist der Souffleur von kulturprogramm.eu, einer Seite mit dem Kulturprogramm in NRW. \
Du arbeitest seit vierzig Jahren am Theater, kennst die Stücke, die Leute und die \
Geschichten dahinter, und du erzählst gern davon. Bei Filmen gilt dieselbe Stimme.

Deine Aufgabe: Recherchiere zu einer Produktion und schreib zwei bis vier Sätze, die \
neugierig machen. Such nach dem, was diesen Abend interessant macht.

Wie du recherchierst:
- Du hast höchstens {MAX_SEARCHES} Suchen und {MAX_FETCHES} Seitenabrufe.
- Lies zuerst den Text der Seite der Spielstätte, wenn er unten steht. Ruf diese \
Seite nicht noch einmal ab. Steht nur die URL da, ruf sie ab. Die Seite ist dein \
Ausgangspunkt: Dort findest du Namen, Team und Werk, nach denen du suchst.
- Überleg dir vor der ersten Suche, was dir noch fehlt, zum Beispiel: Wer macht die \
Regie? Hat jemand davon einen wichtigen Preis? Was ist die Geschichte des Werks? Jede \
Suche klärt eine dieser Fragen.
- Findet eine Suche nichts, ist das die Antwort: Dazu gibt es nichts zu erzählen. Such \
nicht noch einmal mit anderen Worten danach.
- Hast du einen Fakt aus Punkt 1 bis 3 (siehe unten) gefunden und geprüft, hör auf zu \
suchen und schreib.

Wo du suchst:
- Zum Beispiel Wikipedia, nachtkritik.de, Bachtrack, Seiten von Festivals \
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

Die Beschreibung der Spielstätte nacherzählen ist kein Kontext: Die kann jeder selbst \
lesen. Dein Text braucht mindestens einen Fakt aus Punkt 1 bis 3, der nicht schon in \
der Ankündigung steht. Findest du keinen, antworte NICHTS.

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
# httpx logs each request with its URL at INFO. The Telegram URL holds the bot
# token, so these lines must not reach the log (and they skip the format above).
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("enricher")
CTX_WIDTH = 22


def ctx(label: str) -> str:
    """The prefix of a log line: a production title or "batch" in a fixed column."""
    return f"{label:<{CTX_WIDTH}.{CTX_WIDTH}} |"


@dataclass
class Batch:
    """
    The results of one batch, for the report. The worker threads add the
    usage of each answer, also of failed ones: they cost too.
    """

    dry_run: bool = False
    results: list[str] = field(default_factory=list)  # "note", "nothing", "failed" per production
    requests: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    searches: int = 0
    cost: float = 0.0  # US dollars: OpenRouter's usage.cost, the amount charged
    started: float = field(default_factory=monotonic)
    lock: Lock = field(default_factory=Lock, repr=False)

    def add_usage(self, usage: dict) -> None:
        """Adds the `usage` of one OpenRouter answer. Called from the worker threads."""
        with self.lock:
            self.requests += 1
            self.prompt_tokens += usage.get("prompt_tokens", 0)
            self.completion_tokens += usage.get("completion_tokens", 0)
            self.searches += usage.get("server_tool_use_details", {}).get("web_search_requests", 0)
            self.cost += usage.get("cost") or 0.0

    @property
    def cost_per_request(self) -> float:
        return self.cost / self.requests if self.requests else 0.0

    @property
    def minutes(self) -> float:
        return (monotonic() - self.started) / 60

    def report(self) -> str:
        count = self.results.count
        return "\n".join([
            f"📊 Enricher · {len(self.results)} productions" + (" (dry run)" if self.dry_run else ""),
            f"{count('note')} Kontexte · {count('nothing')} nothing found · {count('failed')} failed",
            f"${self.cost:.2f} (${self.cost_per_request:.3f} per production)"
            f" · {short(self.prompt_tokens)} in / {short(self.completion_tokens)} out tokens"
            f" · {self.searches} searches · {self.minutes:.0f} min",
        ])


def short(number: int) -> str:
    """A token count in short form: 1.9M, 140k."""
    if number >= 1_000_000:
        return f"{number / 1_000_000:.1f}M"
    return f"{number / 1000:.0f}k" if number >= 1000 else str(number)


def send_telegram(text: str) -> None:
    """
    Sends `text` to the Telegram chat TELEGRAM_CHAT_ID through the bot
    TELEGRAM_BOT_TOKEN (both from backend/deploy/.env). Without them: does
    nothing. A text longer than one message becomes several, split between
    lines. Waits SEND_INTERVAL_S after each message: Telegram accepts about
    20 messages per minute in one chat. One call at a time (the enricher
    sends from its worker threads), so the waits add up. Never raises: a failed report must not
    stop the loop. A copy of send_telegram() in backend/scraper/core.py.
    """
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        return
    with SEND_LOCK:
        for chunk in split_message(text):
            try:
                httpx.post(
                    f"https://api.telegram.org/bot{token}/sendMessage",
                    json={"chat_id": chat_id, "text": chunk},
                    timeout=10,
                ).raise_for_status()
            except Exception as error:
                # the token is in the URL: log only the error type and the status
                status = getattr(getattr(error, "response", None), "status_code", "")
                log.warning(f"{ctx('telegram')} report not sent: {type(error).__name__} {status}")
                return
            sleep(SEND_INTERVAL_S)


# 3 s: at most 20 messages per minute
SEND_INTERVAL_S = 3
# one send_telegram() at a time
SEND_LOCK = Lock()
# Telegram refuses longer messages
MAX_MESSAGE = 4096


def split_message(text: str) -> list[str]:
    """Splits `text` into parts of at most MAX_MESSAGE characters, between lines."""
    parts, current = [], ""
    for line in text.split("\n"):
        # a line longer than one message: cut it into pieces
        for piece in [line[i : i + MAX_MESSAGE] for i in range(0, len(line), MAX_MESSAGE)] or [""]:
            if current and len(current) + 1 + len(piece) > MAX_MESSAGE:
                parts.append(current)
                current = piece
            else:
                current = f"{current}\n{piece}" if current else piece
    return parts + [current] if current else parts


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


def venue_text(url: str, label: str) -> str | None:
    """
    The visible text of the venue page at `url`, at most VENUE_CHARS
    characters, or None when the download fails or gives no HTML. Drops only
    what a browser does not show as text (scripts, styles, SVG), not menus or
    footers: guessing what is content would lose content on some sites. A
    failure only costs the model a fetch, so it never raises.
    """
    try:
        with VENUE_LOCK:
            # some sites answer 403 to httpx's default User-Agent (as in the scraper)
            response = httpx.get(
                url, follow_redirects=True, timeout=30, headers={"User-Agent": "Mozilla/5.0"}
            )
        response.raise_for_status()
    except Exception as error:
        log.debug(f"{ctx(label)} venue page not read: {type(error).__name__} {error}")
        return None
    if "html" not in response.headers.get("content-type", ""):
        return None
    soup = BeautifulSoup(response.text, "html.parser")
    for tag in soup(["script", "style", "noscript", "template", "svg"]):
        tag.decompose()
    root = soup.body or soup
    lines = (" ".join(line.split()) for line in root.get_text("\n").splitlines())
    text = "\n".join(line for line in lines if line)[:VENUE_CHARS]
    log.debug(f"{ctx(label)} venue page: {len(text)} characters")
    return text or None


def ask(production: tuple, key: str, batch: Batch) -> str:
    """
    Sends one production to the model and returns the text of the answer.
    OpenRouter runs the web searches and page fetches during the request.
    Adds the answer's usage to `batch`.
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
        text = venue_text(url, title)
        if text:
            lines.append(f"\nText dieser Seite (schon abgerufen):\n{text}")
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
    batch.add_usage(usage)
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


def enrich(production: tuple, key: str, batch: Batch) -> str:
    """
    Looks up one production and saves its notes. Returns "note", "nothing"
    or "failed". A failed production stays not looked up, so the next batch
    tries it again. Runs in a worker thread: it logs, but never raises.
    """
    label = production[1]
    log.info(f"{ctx(label)} looking up at {production[4]}, {production[5]} ({production[3]})")
    try:
        note_de, note_en = parse(ask(production, key, batch))
        if not batch.dry_run:
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
    # each new note at once, the summary after the batch
    _, title, category, _, venues, city, _ = production
    send_telegram(f"💬 {title}\n{CATEGORY_DE.get(category, category)} · {venues}, {city}\n\n{note_de}")
    log.info(f"{ctx(label)} DE {note_de}")
    log.info(f"{ctx(label)} EN {note_en}")
    return "note"


def run_batch(limit: int, title: str | None, dry_run: bool) -> Batch:
    """
    Looks up one batch of productions, PARALLEL requests at a time. The
    requests mostly wait for the API, so threads are enough. Each log line
    names its production, so the interleaved lines stay readable. Returns
    the results and the usage.
    """
    batch = Batch(dry_run=dry_run)
    key = secret("OPENROUTER_API_KEY_FILE")
    productions = pending(limit, title)
    log.info(f"{ctx('batch')} {len(productions)} productions to look up,"
             f" {PARALLEL} at a time"
             + (" (dry run: nothing is saved)" if dry_run else ""))
    with ThreadPoolExecutor(max_workers=PARALLEL) as pool:
        batch.results = list(pool.map(lambda p: enrich(p, key, batch), productions))
    log.info(
        f"{ctx('batch')} {batch.results.count('note')} notes,"
        f" {batch.results.count('nothing')} nothing found, {batch.results.count('failed')} failed"
    )
    return batch


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--once", action="store_true", help="one batch, then stop")
    parser.add_argument("--dry-run", action="store_true", help="print, do not write")
    parser.add_argument("--limit", type=int, default=BATCH, help="productions per batch")
    parser.add_argument("--title", help="only titles that contain this text")
    args = parser.parse_args()
    while True:
        if args.once or args.dry_run:
            send_telegram(run_batch(args.limit, args.title, args.dry_run).report())
            return
        try:
            send_telegram(run_batch(args.limit, args.title, args.dry_run).report())
        except Exception as error:
            # e.g. the database is down or its schema changed under a running container:
            # wait like after a batch, instead of crashing into a restart loop
            log.exception(f"{ctx('batch')} failed")
            send_telegram(f"❌ Enricher · batch failed: {type(error).__name__}: {error}"[:500])
        log.info(f"{ctx('batch')} next batch in {INTERVAL_HOURS:g} h")
        sleep(INTERVAL_HOURS * 3600)


if __name__ == "__main__":
    main()
