CREATE TABLE events (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title     text        NOT NULL,
    venue     text        NOT NULL,
    starts_at timestamptz NOT NULL,
    UNIQUE (title, venue, starts_at)
);