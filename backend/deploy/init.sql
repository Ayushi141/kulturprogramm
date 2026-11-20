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

CREATE TABLE events (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title      text        NOT NULL,
    venue_id   text        NOT NULL REFERENCES venues (id),
    -- the values of the scraper's Category enum
    category   text        NOT NULL CHECK (category IN ('film', 'theater', 'oper', 'konzert', 'tanz')),
    starts_at  timestamptz NOT NULL,
    ends_at    timestamptz,
    url        text,
    image_key  text REFERENCES images (key),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (title, venue_id, starts_at)
);

-- The frontend reads a window of start times. Rows are never deleted, and
-- sources list whole seasons, so the table keeps growing.
CREATE INDEX events_starts_at ON events (starts_at);

-- Productions shown in the "In focus" card, by event title. The card shows the
-- next performance of one of them; `until` (inclusive) ends the feature, NULL
-- keeps it until the row is deleted. The scraper never touches this table.
CREATE TABLE featured (
    title    text PRIMARY KEY,
    until    date,
    added_at timestamptz NOT NULL DEFAULT now()
);
