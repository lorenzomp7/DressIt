import { pool } from "../db/pool.js";

export interface AdminStats {
  users: { total: number; last7d: number };
  items: { total: number; last7d: number; byCategory: Record<string, number> };
  ai: {
    kind: "tag" | "outfit";
    calls7d: number;
    errors7d: number;
    avgLatencyMs: number | null;
    p95LatencyMs: number | null;
  }[];
  recentErrors: { kind: string; statusCode: number | null; error: string | null; createdAt: string }[];
}

export async function getStats(): Promise<AdminStats> {
  const [users, items, categories, ai, errors] = await Promise.all([
    pool.query<{ total: string; last7d: string }>(
      `SELECT count(*) AS total, count(*) FILTER (WHERE created_at > now() - interval '7 days') AS last7d
       FROM users`,
    ),
    pool.query<{ total: string; last7d: string }>(
      `SELECT count(*) AS total, count(*) FILTER (WHERE created_at > now() - interval '7 days') AS last7d
       FROM items`,
    ),
    pool.query<{ category: string; n: string }>(
      "SELECT category, count(*) AS n FROM items GROUP BY category ORDER BY n DESC",
    ),
    pool.query<{ kind: "tag" | "outfit"; calls: string; errors: string; avg: string | null; p95: string | null }>(
      `SELECT kind,
              count(*) AS calls,
              count(*) FILTER (WHERE NOT ok) AS errors,
              round(avg(latency_ms)) AS avg,
              round(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)) AS p95
       FROM ai_events
       WHERE created_at > now() - interval '7 days'
       GROUP BY kind`,
    ),
    pool.query<{ kind: string; status_code: number | null; error: string | null; created_at: Date }>(
      `SELECT kind, status_code, error, created_at FROM ai_events
       WHERE NOT ok ORDER BY created_at DESC LIMIT 10`,
    ),
  ]);

  const byKind = new Map(ai.rows.map((r) => [r.kind, r]));
  return {
    users: { total: Number(users.rows[0]!.total), last7d: Number(users.rows[0]!.last7d) },
    items: {
      total: Number(items.rows[0]!.total),
      last7d: Number(items.rows[0]!.last7d),
      byCategory: Object.fromEntries(categories.rows.map((r) => [r.category, Number(r.n)])),
    },
    ai: (["tag", "outfit"] as const).map((kind) => {
      const r = byKind.get(kind);
      return {
        kind,
        calls7d: Number(r?.calls ?? 0),
        errors7d: Number(r?.errors ?? 0),
        avgLatencyMs: r?.avg != null ? Number(r.avg) : null,
        p95LatencyMs: r?.p95 != null ? Number(r.p95) : null,
      };
    }),
    recentErrors: errors.rows.map((r) => ({
      kind: r.kind,
      statusCode: r.status_code,
      error: r.error,
      createdAt: r.created_at.toISOString(),
    })),
  };
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  itemCount: number;
  lastItemAt: string | null;
  aiCalls: number;
}

export async function listUsers(): Promise<AdminUser[]> {
  const { rows } = await pool.query<{
    id: string;
    email: string;
    display_name: string | null;
    created_at: Date;
    item_count: string;
    last_item_at: Date | null;
    ai_calls: string;
  }>(
    `SELECT u.id, u.email, u.display_name, u.created_at,
            (SELECT count(*) FROM items i WHERE i.user_id = u.id) AS item_count,
            (SELECT max(created_at) FROM items i WHERE i.user_id = u.id) AS last_item_at,
            (SELECT count(*) FROM ai_events e WHERE e.user_id = u.id) AS ai_calls
     FROM users u
     ORDER BY u.created_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    createdAt: r.created_at.toISOString(),
    itemCount: Number(r.item_count),
    lastItemAt: r.last_item_at?.toISOString() ?? null,
    aiCalls: Number(r.ai_calls),
  }));
}

/** Image keys of a user's items, so storage can be cleaned up when the account is deleted. */
export async function deleteUser(id: string): Promise<string[] | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const keys = await client.query<{ image_key: string }>(
      "SELECT image_key FROM items WHERE user_id = $1",
      [id],
    );
    const deleted = await client.query("DELETE FROM users WHERE id = $1", [id]);
    await client.query("COMMIT");
    return deleted.rowCount ? keys.rows.map((r) => r.image_key) : null;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export interface AdminItem {
  id: string;
  ownerEmail: string;
  imageUrl: string;
  name: string;
  category: string;
  colors: string[];
  material: string;
  formality: string;
  warmth: number;
  tags: string[];
  createdAt: string;
}

export async function listRecentItems(limit: number, userId?: string): Promise<AdminItem[]> {
  const { rows } = await pool.query<{
    id: string;
    email: string;
    image_url: string;
    name: string;
    category: string;
    colors: string[];
    material: string;
    formality: string;
    warmth: number;
    tags: string[];
    created_at: Date;
  }>(
    `SELECT i.id, u.email, i.image_url, i.name, i.category, i.colors, i.material,
            i.formality, i.warmth, i.tags, i.created_at
     FROM items i JOIN users u ON u.id = i.user_id
     WHERE ($2::uuid IS NULL OR i.user_id = $2)
     ORDER BY i.created_at DESC
     LIMIT $1`,
    [limit, userId ?? null],
  );
  return rows.map((r) => ({
    id: r.id,
    ownerEmail: r.email,
    imageUrl: r.image_url,
    name: r.name,
    category: r.category,
    colors: r.colors,
    material: r.material,
    formality: r.formality,
    warmth: r.warmth,
    tags: r.tags,
    createdAt: r.created_at.toISOString(),
  }));
}
