-- One row per AI call, so admins can evaluate quality, latency and failure rate.
CREATE TABLE IF NOT EXISTS ai_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('tag', 'outfit')),
  model       TEXT NOT NULL,
  ok          BOOLEAN NOT NULL,
  status_code SMALLINT,
  error       TEXT,
  latency_ms  INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_events_created_at_idx ON ai_events (created_at DESC);
