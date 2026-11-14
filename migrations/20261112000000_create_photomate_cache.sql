CREATE TABLE app.provider_cache (
  cache_key text PRIMARY KEY,
  provider text NOT NULL,
  payload jsonb NOT NULL,
  source_updated_at timestamptz,
  fetched_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX provider_cache_expires_at_idx ON app.provider_cache (expires_at);

CREATE TABLE app.usage_counters (
  scope text NOT NULL,
  slot integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, slot)
);
