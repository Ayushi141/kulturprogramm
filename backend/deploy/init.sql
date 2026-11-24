CREATE TABLE venues (
    id   text PRIMARY KEY,
    name text NOT NULL,
    city text NOT NULL
);

-- Event images, downloaded by the scraper in their original form. Served by the frontend
-- at /img/<key>, so visitors never load images from the venues' servers.
CREATE TABLE images (
    key          text PRIMARY KEY,  -- sha256 of the image bytes (first 32 hex digits)
    source_url   text        NOT NULL,
    content_type text        NOT NULL,
    data         bytea       NOT NULL,
    fetched_at   timestamptz NOT NULL DEFAULT now()
);

-- What people go to see, whatever the date: a staging, a film's run at a
-- cinema, a concert programme. One row per title per source (the scraper's
-- Source.name). Two writers share this table, and each one updates only its
-- own columns: never replace whole rows.
CREATE TABLE productions (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- written by the scraper
    source      text NOT NULL,
    title       text NOT NULL,
    -- the values of the scraper's Category enum
    category    text NOT NULL CHECK (category IN ('film', 'theater', 'oper', 'konzert', 'tanz')),
    image_key   text REFERENCES images (key),
    -- set once, when the scraper first saves the production (its upsert
    -- never writes it); the id gives the same order
    imported_at timestamptz NOT NULL DEFAULT now(),
    -- written by the enricher: the context note in the card's drawer.
    -- enriched_at NULL: not looked up yet. Set with NULL notes: nothing found.
    note_de     text,
    note_en     text,
    enriched_at timestamptz,
    UNIQUE (source, title)
);

-- One dated performance or screening of a production.
CREATE TABLE events (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    production_id bigint      NOT NULL REFERENCES productions (id),
    venue_id      text        NOT NULL REFERENCES venues (id),
    starts_at     timestamptz NOT NULL,
    ends_at       timestamptz,
    url           text,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (production_id, venue_id, starts_at)
);

-- The frontend reads a window of start times. Rows are never deleted, and
-- sources list whole seasons, so the table keeps growing.
CREATE INDEX events_starts_at ON events (starts_at);
-- all dates of one production (the enricher's "has upcoming dates")
CREATE INDEX events_production_id ON events (production_id);

-- Productions shown in the "In focus" card. The card shows the next
-- performance of one of them; `until` (inclusive) ends the feature, NULL
-- keeps it until the row is deleted. The scraper never touches this table.
CREATE TABLE featured (
    production_id bigint PRIMARY KEY REFERENCES productions (id) ON DELETE CASCADE,
    until         date,
    added_at      timestamptz NOT NULL DEFAULT now()
);
