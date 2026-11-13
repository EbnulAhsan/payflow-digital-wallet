#!/bin/sh
# Applies payflow-backend/migrations/*.up.sql in order, once each, as the
# database owner. Used by docker-compose.staging.yml (PG* variables come from
# the compose file), so a redeploy only runs migrations it has not seen yet.
set -eu

psql -v ON_ERROR_STOP=1 -c "CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)"

for file in $(ls /migrations/*.up.sql | sort); do
  name=$(basename "$file")
  applied=$(psql -tAc "SELECT 1 FROM schema_migrations WHERE name = '$name'")
  if [ "$applied" = "1" ]; then
    echo "Already applied: $name"
    continue
  fi
  echo "Applying: $name"
  psql -v ON_ERROR_STOP=1 -f "$file"
  psql -v ON_ERROR_STOP=1 -c "INSERT INTO schema_migrations (name) VALUES ('$name')"
done
