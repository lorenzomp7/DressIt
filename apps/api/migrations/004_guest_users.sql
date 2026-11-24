-- Accesso senza account ("Continua come ospite", come FreeWay): l'ospite è un utente vero,
-- con armadio e storico, ma senza email né password finché non crea un account.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN is_guest BOOLEAN NOT NULL DEFAULT false;
-- Ultimo uso dell'app: rinnova l'accesso dell'ospite e decide la pulizia degli inattivi.
ALTER TABLE users ADD COLUMN last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE users ADD CONSTRAINT users_guest_or_credentials
  CHECK (is_guest OR (email IS NOT NULL AND password_hash IS NOT NULL));
CREATE INDEX users_inactive_guests_idx ON users (last_seen_at) WHERE is_guest;
