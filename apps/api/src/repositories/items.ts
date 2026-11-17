import { pool } from "../db/pool.js";
import type { GarmentAttributes, Item, ItemUpdate } from "../domain.js";

interface ItemRow {
  id: string;
  user_id: string;
  image_url: string;
  image_key: string;
  name: string;
  category: Item["category"];
  subcategory: string;
  colors: string[];
  pattern: string;
  material: string;
  seasons: Item["seasons"];
  formality: Item["formality"];
  warmth: number;
  tags: string[];
  description: string;
  last_worn_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function toItem(r: ItemRow): Item {
  return {
    id: r.id,
    userId: r.user_id,
    imageUrl: r.image_url,
    imageKey: r.image_key,
    name: r.name,
    category: r.category,
    subcategory: r.subcategory,
    colors: r.colors,
    pattern: r.pattern,
    material: r.material,
    seasons: r.seasons,
    formality: r.formality,
    warmth: r.warmth,
    tags: r.tags,
    description: r.description,
    lastWornAt: r.last_worn_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function listItems(userId: string): Promise<Item[]> {
  const { rows } = await pool.query<ItemRow>(
    "SELECT * FROM items WHERE user_id = $1 ORDER BY created_at DESC",
    [userId],
  );
  return rows.map(toItem);
}

export async function getItem(userId: string, id: string): Promise<Item | null> {
  const { rows } = await pool.query<ItemRow>(
    "SELECT * FROM items WHERE user_id = $1 AND id = $2",
    [userId, id],
  );
  return rows[0] ? toItem(rows[0]) : null;
}

export async function createItem(
  userId: string,
  image: { url: string; key: string },
  a: GarmentAttributes,
): Promise<Item> {
  const { rows } = await pool.query<ItemRow>(
    `INSERT INTO items (user_id, image_url, image_key, name, category, subcategory, colors,
                        pattern, material, seasons, formality, warmth, tags, description)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      userId,
      image.url,
      image.key,
      a.name,
      a.category,
      a.subcategory,
      a.colors,
      a.pattern,
      a.material,
      a.seasons,
      a.formality,
      a.warmth,
      a.tags,
      a.description,
    ],
  );
  return toItem(rows[0]!);
}

const COLUMN_BY_FIELD: Record<keyof ItemUpdate, string> = {
  name: "name",
  category: "category",
  subcategory: "subcategory",
  colors: "colors",
  pattern: "pattern",
  material: "material",
  seasons: "seasons",
  formality: "formality",
  warmth: "warmth",
  tags: "tags",
  description: "description",
};

export async function updateItem(
  userId: string,
  id: string,
  patch: ItemUpdate,
): Promise<Item | null> {
  const sets: string[] = [];
  const values: unknown[] = [userId, id];
  for (const [field, column] of Object.entries(COLUMN_BY_FIELD)) {
    const value = patch[field as keyof ItemUpdate];
    if (value === undefined) continue;
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }
  if (sets.length === 0) return getItem(userId, id);

  const { rows } = await pool.query<ItemRow>(
    `UPDATE items SET ${sets.join(", ")}, updated_at = now()
     WHERE user_id = $1 AND id = $2 RETURNING *`,
    values,
  );
  return rows[0] ? toItem(rows[0]) : null;
}

export async function deleteItem(userId: string, id: string): Promise<Item | null> {
  const { rows } = await pool.query<ItemRow>(
    "DELETE FROM items WHERE user_id = $1 AND id = $2 RETURNING *",
    [userId, id],
  );
  return rows[0] ? toItem(rows[0]) : null;
}

/** Atomically record all owned garments or reject the entire outfit. */
export async function markWorn(userId: string, ids: string[], timezone = "Europe/Rome"): Promise<number | null> {
  const uniqueIds = [...new Set(ids)];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const owned = await client.query(
      "SELECT id FROM items WHERE user_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE",
      [userId, uniqueIds],
    );
    if (owned.rowCount !== uniqueIds.length) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query(
      `INSERT INTO item_wear_history (item_id, worn_on)
       SELECT id, (now() AT TIME ZONE $3)::date FROM items
       WHERE user_id = $1 AND id = ANY($2::uuid[])
       ON CONFLICT (item_id, worn_on) DO NOTHING`,
      [userId, uniqueIds, timezone],
    );
    await client.query(
      "UPDATE items SET last_worn_at = now() WHERE user_id = $1 AND id = ANY($2::uuid[])",
      [userId, uniqueIds],
    );
    await client.query("COMMIT");
    return uniqueIds.length;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
