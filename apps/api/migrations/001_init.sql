CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_url       TEXT NOT NULL,
  image_key       TEXT NOT NULL,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,
  subcategory     TEXT NOT NULL DEFAULT '',
  colors          TEXT[] NOT NULL DEFAULT '{}',
  pattern         TEXT NOT NULL DEFAULT '',
  material        TEXT NOT NULL DEFAULT '',
  seasons         TEXT[] NOT NULL DEFAULT '{}',
  formality       TEXT NOT NULL DEFAULT 'casual',
  warmth          SMALLINT NOT NULL DEFAULT 3 CHECK (warmth BETWEEN 1 AND 5),
  tags            TEXT[] NOT NULL DEFAULT '{}',
  description     TEXT NOT NULL DEFAULT '',
  last_worn_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS items_user_id_created_at_idx ON items (user_id, created_at DESC);
