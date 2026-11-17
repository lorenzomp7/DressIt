-- One confirmed use per garment and local calendar day, safe to retry.
CREATE TABLE item_wear_history (
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  worn_on DATE NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, worn_on)
);

-- Preserve known past use; earlier dates cannot be reconstructed.
INSERT INTO item_wear_history (item_id, worn_on, recorded_at)
SELECT id, (last_worn_at AT TIME ZONE 'Europe/Rome')::date, last_worn_at
FROM items WHERE last_worn_at IS NOT NULL;
