CREATE TABLE venues (
    id   text PRIMARY KEY,
    name text NOT NULL,
    city text NOT NULL
);

CREATE TABLE events (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title      text        NOT NULL,
    venue_id   text        NOT NULL REFERENCES venues (id),
    category   text        NOT NULL,
    starts_at  timestamptz NOT NULL,
    ends_at    timestamptz NOT NULL,
    url        text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (title, venue_id, starts_at)
);