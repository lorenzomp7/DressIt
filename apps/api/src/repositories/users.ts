import { pool } from "../db/pool.js";

export interface UserRow {
  id: string;
  /** null for guests. */
  email: string | null;
  /** null for guests. */
  password_hash: string | null;
  display_name: string | null;
  is_guest: boolean;
}

const COLUMNS = "id, email, password_hash, display_name, is_guest";

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE email = $1`, [
    email.toLowerCase(),
  ]);
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createUser(
  email: string,
  passwordHash: string,
  displayName: string | null,
): Promise<UserRow> {
  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING ${COLUMNS}`,
    [email.toLowerCase(), passwordHash, displayName],
  );
  return rows[0]!;
}

/** A guest: a real user with a wardrobe but no email or password ("Continua come ospite"). */
export async function createGuest(): Promise<UserRow> {
  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (is_guest) VALUES (true) RETURNING ${COLUMNS}`,
  );
  return rows[0]!;
}

/**
 * Turn a guest into a full account, keeping the same id and therefore the whole wardrobe.
 * Returns null if the user is not (or no longer) a guest, "taken" if the email is in use.
 */
export async function upgradeGuest(
  id: string,
  email: string,
  passwordHash: string,
  displayName: string | null,
): Promise<UserRow | "taken" | null> {
  try {
    const { rows } = await pool.query<UserRow>(
      `UPDATE users SET email = $2, password_hash = $3, display_name = COALESCE($4, display_name),
              is_guest = false, last_seen_at = now()
       WHERE id = $1 AND is_guest
       RETURNING ${COLUMNS}`,
      [id, email.toLowerCase(), passwordHash, displayName],
    );
    return rows[0] ?? null;
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return "taken"; // unique_violation on email
    throw err;
  }
}

/** Record that the user opened the app (renews a guest's access, keeps them off the cleanup). */
export async function touchUser(id: string): Promise<void> {
  await pool.query("UPDATE users SET last_seen_at = now() WHERE id = $1", [id]);
}

/**
 * Delete guests idle for more than `days` days, with their items (cascade).
 * Returns the image keys so the caller can remove the files from storage.
 */
export async function deleteInactiveGuests(days: number): Promise<{ users: number; imageKeys: string[] }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE is_guest AND last_seen_at < now() - make_interval(days => $1)
       FOR UPDATE SKIP LOCKED`,
      [days],
    );
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) {
      await client.query("COMMIT");
      return { users: 0, imageKeys: [] };
    }
    // Image keys must be read before the cascade removes the items.
    const keys = await client.query<{ user_id: string; image_key: string }>(
      "SELECT user_id, image_key FROM items WHERE user_id = ANY($1::uuid[])",
      [ids],
    );
    // Re-check is_guest: an account is never deleted, and only deleted users lose their photos.
    const deleted = await client.query<{ id: string }>(
      "DELETE FROM users WHERE id = ANY($1::uuid[]) AND is_guest RETURNING id",
      [ids],
    );
    await client.query("COMMIT");
    const gone = new Set(deleted.rows.map((r) => r.id));
    return {
      users: gone.size,
      imageKeys: keys.rows.filter((r) => gone.has(r.user_id)).map((r) => r.image_key),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
