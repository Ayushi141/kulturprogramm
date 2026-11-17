CREATE TABLE events (
    title TEXT NOT NULL,
    venue TEXT NOT NULL,
    starts_at TIMESTAMP NOT NULL,
    PRIMARY KEY (title, venue, starts_at)
);