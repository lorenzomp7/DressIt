import { pool } from "../db/pool.js";

export interface WearDay {
  date: string;
  itemIds: string[];
}

/** Bounded recent history, isolated to the authenticated user's wardrobe. */
export async function listWearHistory(userId: string): Promise<WearDay[]> {
  const { rows } = await pool.query<{ date: string; item_ids: string[] }>(
    `SELECT h.worn_on::text AS date, array_agg(h.item_id ORDER BY h.item_id) AS item_ids
     FROM item_wear_history h JOIN items i ON i.id = h.item_id
     WHERE i.user_id = $1
     GROUP BY h.worn_on ORDER BY h.worn_on DESC LIMIT 30`,
    [userId],
  );
  return rows.map((r) => ({ date: r.date, itemIds: r.item_ids }));
}
