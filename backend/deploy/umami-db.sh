# backend/deploy/umami-db.sh  (runs once, on an empty data directory)
set -e
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
  -v pw="$(cat /run/secrets/pg_password)" <<'SQL'
CREATE ROLE umami LOGIN PASSWORD :'pw';
CREATE DATABASE umami OWNER umami;
SQL