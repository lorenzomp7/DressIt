import { pool } from "../db/pool.js";

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(
    "SELECT id, email, password_hash, display_name FROM users WHERE email = $1",
    [email.toLowerCase()],
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(
    "SELECT id, email, password_hash, display_name FROM users WHERE id = $1",
    [id],
  );
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
     RETURNING id, email, password_hash, display_name`,
    [email.toLowerCase(), passwordHash, displayName],
  );
  return rows[0]!;
}
