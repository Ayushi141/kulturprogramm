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
    category   text        NOT NULL,
    starts_at  timestamptz NOT NULL,
    ends_at    timestamptz,
    url        text,
    image_key  text REFERENCES images (key),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (title, venue_id, starts_at)
);
