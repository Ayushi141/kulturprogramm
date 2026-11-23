"""
Writes the context notes for productions (the speech bubble in the card's
drawer). For each production that has upcoming dates and was not looked up
yet, the enricher sends one request to the Claude API. Claude searches the
web, reads the pages it finds and writes the note in German and English.

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
import os
import re
from datetime import datetime
from pathlib import Path
from time import sleep

import httpx
import psycopg

MODEL = os.environ.get("ENRICH_MODEL", "claude-sonnet-5-5")
API_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2026-10-21"
# productions per batch: the daily cost limit
BATCH = int(os.environ.get("ENRICH_BATCH", "30"))
# hours between batches
INTERVAL_HOURS = float(os.environ.get("ENRICH_INTERVAL_HOURS", "6"))
# the answer when Claude found nothing worth telling
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

Antwortformat, ohne Überschriften, Quellen oder sonstigen Text:
Zuerst der deutsche Text. Dann eine Zeile nur mit drei Bindestrichen (---). Dann der \
englische Text, im selben Ton neu geschrieben, nicht wörtlich übersetzt.
Oder nur: NICHTS
"""

CATEGORY_DE = {
    "film": "Film",
    "theater": "Theater",
    "oper": "Oper",
    "konzert": "Konzert",
    "tanz": "Tanz",
}


def debug(*args) -> None:
    """Writes a line with a timestamp. flush=True: Docker buffers stdout otherwise."""
    print(datetime.now().strftime("%H:%M:%S"), *args, flush=True)


def secret(name: str) -> str:
    """Reads the file that the environment variable `name` points to."""
    return Path(os.environ[name]).read_text().strip()


def connect() -> psycopg.Connection:
    return psycopg.connect(password=secret("PGPASSWORD_FILE"))


def pending(limit: int, title: str | None) -> list[tuple]:
    """
    Productions to look up: not looked up yet, with upcoming dates, the
    soonest first. Each row: id, title, category, venues, city, url.
    """
    with connect() as conn:
        return conn.execute(
            """
            SELECT p.id, p.title, p.category,
                   string_agg(DISTINCT v.name, ', '),
                   min(v.city),
                   (array_agg(e.url ORDER BY e.starts_at) FILTER (WHERE e.url IS NOT NULL))[1]
            FROM productions p
            JOIN events e ON e.production_id = p.id
            JOIN venues v ON v.id = e.venue_id
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
    Sends one production to Claude and returns the text of the answer.
    Claude runs the web search and web fetch itself, on the API's side.
    """
    _, title, category, venues, city, url = production
    lines = [
        f"Titel: {title}",
        f"Sparte: {CATEGORY_DE.get(category, category)}",
        f"Spielstätte: {venues}, {city}",
    ]
    if url:
        # web fetch can only read URLs that appear in a user message
        lines.append(f"Seite der Spielstätte: {url}")
    messages = [{"role": "user", "content": "\n".join(lines)}]
    tools = [
        {"type": "web_search_20250305", "name": "web_search", "max_uses": 5},
        {"type": "web_fetch_20250910", "name": "web_fetch", "max_uses": 5},
    ]
    done = []  # content of paused requests, sent back to continue the turn
    while True:
        response = httpx.post(
            API_URL,
            headers={
                "x-api-key": key,
                "anthropic-version": API_VERSION,
                "content-type": "application/json",
            },
            json={
                "model": MODEL,
                "max_tokens": 16000,
                "system": SYSTEM,
                "messages": messages,
                "tools": tools,
            },
            timeout=600,
        )
        response.raise_for_status()
        body = response.json()
        # a long search can pause the turn: send the content back to continue it
        if body["stop_reason"] != "pause_turn":
            break
        done += body["content"]
        messages = [messages[0], {"role": "assistant", "content": done}]
    usage = body["usage"]
    debug(
        f"  {usage['input_tokens']} input, {usage['output_tokens']} output tokens,",
        usage.get("server_tool_use", {}),
    )
    # citations split the answer into several text blocks
    return "".join(b["text"] for b in body["content"] if b["type"] == "text").strip()


def parse(text: str) -> tuple[str | None, str | None]:
    """
    The German and English note from an answer. NICHTS gives two Nones.
    Raises ValueError when the answer has another format.
    """
    if text.strip(" .\n") == NOTHING:
        return None, None
    parts = re.split(r"^\s*---\s*$", text, flags=re.MULTILINE)
    if len(parts) != 2 or not all(p.strip() for p in parts):
        raise ValueError(f"answer is not 'German --- English': {text!r}")
    return parts[0].strip(), parts[1].strip()


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


def run_batch(limit: int, title: str | None, dry_run: bool) -> None:
    """
    Looks up one batch of productions. A failed production is logged and
    stays not looked up, so the next batch tries it again.
    """
    key = secret("ANTHROPIC_API_KEY_FILE")
    productions = pending(limit, title)
    debug(f"{len(productions)} productions to look up")
    for production in productions:
        debug(f"=== {production[1]} ({production[3]}, {production[4]})")
        try:
            note_de, note_en = parse(ask(production, key))
        except Exception as error:
            print(f"  failed: {error!r}", flush=True)
            continue
        print(note_de or "(nichts gefunden)", "\n  ---\n", note_en or "", flush=True)
        if not dry_run:
            save(production[0], note_de, note_en)


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
        sleep(INTERVAL_HOURS * 3600)


if __name__ == "__main__":
    main()
