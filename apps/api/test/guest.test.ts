// Accesso senza account ("Continua come ospite", come FreeWay).
// Servono un database usa e getta: TEST_DATABASE_URL con "test" nel nome (vedi mcp.test.ts).
import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import type { FastifyInstance } from "fastify";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB && !/test/i.test(new URL(TEST_DB).pathname)) {
  throw new Error("TEST_DATABASE_URL deve puntare a un database di test (il nome deve contenere 'test'): i test lo svuotano");
}
const UPLOADS = mkdtempSync(join(tmpdir(), "dressit-guest-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: TEST_DB ?? "postgres://test:test@127.0.0.1:1/dressit_test",
  JWT_SECRET: "test-secret-di-almeno-trentadue-caratteri",
  GEMINI_API_KEY: "test",
  UPLOAD_DIR: UPLOADS,
  CORS_ORIGIN: "http://localhost:3000",
  ADMIN_EMAILS: "admin@example.test",
});
delete process.env.CLOUDINARY_URL;

let app: FastifyInstance;

before(async () => {
  const { buildApp } = await import("../src/app.js");
  app = await buildApp();
});
after(async () => {
  await app?.close();
  const { pool } = await import("../src/db/pool.js");
  await pool.end();
});

test("isAdmin non considera mai admin un ospite senza email", async () => {
  const { isAdmin } = await import("../src/plugins/auth.js");
  assert.equal(isAdmin(undefined), false);
  assert.equal(isAdmin(null), false);
  assert.equal(isAdmin("ADMIN@example.test"), true);
});

describe("con il database di test", { skip: TEST_DB ? false : "TEST_DATABASE_URL non impostata" }, () => {
  // Ogni test ha il suo IP, così i limiti per IP di un test non tolgono richieste agli altri.
  let ip = 10;
  const nextIp = () => `198.51.100.${ip++}`;
  const post = (url: string, payload?: object, token?: string, remoteAddress = nextIp()) =>
    app.inject({
      method: "POST",
      url,
      remoteAddress,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      ...(payload ? { payload } : {}),
    });
  const get = (url: string, token: string) =>
    app.inject({ method: "GET", url, remoteAddress: nextIp(), headers: { authorization: `Bearer ${token}` } });
  const pool = async () => (await import("../src/db/pool.js")).pool;

  async function newGuest() {
    const res = await post("/auth/guest");
    assert.equal(res.statusCode, 201);
    return res.json() as { token: string; user: { id: string; email: null; isGuest: boolean; isAdmin: boolean } };
  }
  async function addItem(userId: string, key: string) {
    await (await pool()).query(
      `INSERT INTO items (user_id, image_url, image_key, name, category) VALUES ($1, 'http://x/y.jpg', $2, 'Maglia', 'top')`,
      [userId, key],
    );
  }

  before(async () => {
    const { migrate } = await import("../src/db/migrate.js");
    await migrate();
    await (await pool()).query("TRUNCATE users CASCADE");
  });

  test("Continua come ospite crea un utente senza email che usa l'app come gli altri", async () => {
    const { token, user } = await newGuest();
    assert.equal(user.isGuest, true);
    assert.equal(user.email, null);
    assert.equal(user.isAdmin, false);
    const items = await get("/items", token);
    assert.equal(items.statusCode, 200);
    assert.deepEqual(items.json(), { items: [] });
    assert.equal((await get("/admin/stats", token)).statusCode, 403, "un ospite non è mai admin");
  });

  test("ogni apertura dell'app rinnova l'accesso dell'ospite; gli account no", async () => {
    const { token, user } = await newGuest();
    const db = await pool();
    await db.query("UPDATE users SET last_seen_at = now() - interval '10 days' WHERE id = $1", [user.id]);
    const me = await get("/auth/me", token);
    assert.equal(me.statusCode, 200);
    const renewed = me.json().token as string;
    const claims = app.jwt.decode<{ sub: string; guest: boolean; exp: number }>(renewed)!;
    assert.equal(claims.sub, user.id);
    assert.equal(claims.guest, true);
    const daysLeft = (claims.exp * 1000 - Date.now()) / 86_400_000;
    assert.ok(daysLeft > 89 && daysLeft <= 90, `accesso ospite di 90 giorni, trovati ${daysLeft.toFixed(1)}`);
    const seen = (await db.query("SELECT last_seen_at > now() - interval '1 minute' AS fresh FROM users WHERE id = $1", [user.id])).rows[0];
    assert.equal(seen.fresh, true, "last_seen_at aggiornato");

    const reg = await post("/auth/register", { email: "conto@example.test", password: "password-lunga" });
    assert.equal(reg.statusCode, 201);
    const account = await get("/auth/me", reg.json().token);
    assert.equal(account.json().token, undefined, "un account non riceve token nuovi da /auth/me");
    assert.equal(account.json().user.isGuest, false);
  });

  test("un ospite crea un account e tiene l'armadio", async () => {
    const { token, user } = await newGuest();
    await addItem(user.id, "items/ospite-1.jpg");
    const up = await post("/auth/upgrade", { email: "Nuovo@Example.test", password: "password-lunga", displayName: "Lori" }, token);
    assert.equal(up.statusCode, 200);
    const body = up.json();
    assert.equal(body.user.id, user.id, "stesso utente");
    assert.equal(body.user.isGuest, false);
    assert.equal(body.user.email, "nuovo@example.test");
    assert.equal(body.user.displayName, "Lori");
    const items = await get("/items", body.token);
    assert.equal(items.json().items.length, 1, "i capi da ospite ci sono ancora");

    const login = await post("/auth/login", { email: "nuovo@example.test", password: "password-lunga" });
    assert.equal(login.statusCode, 200);
    assert.equal(login.json().user.id, user.id);

    assert.equal((await post("/auth/upgrade", { email: "altro@example.test", password: "password-lunga" }, body.token)).statusCode, 409,
      "un account non si può convertire di nuovo");
  });

  test("con un'email già usata il passaggio ad account fallisce e l'ospite resta ospite", async () => {
    await post("/auth/register", { email: "presa@example.test", password: "password-lunga" });
    const { token, user } = await newGuest();
    const res = await post("/auth/upgrade", { email: "presa@example.test", password: "password-lunga" }, token);
    assert.equal(res.statusCode, 409);
    assert.match(res.json().error, /Esiste già/);
    const row = (await (await pool()).query("SELECT is_guest, email FROM users WHERE id = $1", [user.id])).rows[0];
    assert.deepEqual(row, { is_guest: true, email: null });
    assert.equal((await post("/auth/upgrade", { email: "corta@example.test", password: "corta" }, token)).statusCode, 400);
    assert.equal((await post("/auth/upgrade", { email: "x@example.test", password: "password-lunga" })).statusCode, 401);
  });

  test("al massimo 5 ospiti l'ora dallo stesso indirizzo", async () => {
    const from = nextIp();
    for (let i = 0; i < 5; i++) assert.equal((await post("/auth/guest", undefined, undefined, from)).statusCode, 201);
    assert.equal((await post("/auth/guest", undefined, undefined, from)).statusCode, 429);
    assert.equal((await post("/auth/guest", undefined, undefined, nextIp())).statusCode, 201, "un altro indirizzo entra");
  });

  test("la pulizia cancella solo gli ospiti inattivi da più di 90 giorni, foto comprese", async () => {
    const db = await pool();
    const { storage } = await import("../src/services/storage.js");
    const { cleanupInactiveGuests } = await import("../src/services/guestCleanup.js");
    const old = await newGuest();
    const recent = await newGuest();
    const saved = await storage.save(old.user.id, Buffer.from("foto finta"));
    await addItem(old.user.id, saved.key);
    assert.ok(existsSync(join(UPLOADS, saved.key)));
    const reg = await post("/auth/register", { email: "vecchio@example.test", password: "password-lunga" });
    const oldAccount = reg.json().user.id as string;
    await db.query("UPDATE users SET last_seen_at = now() - interval '91 days' WHERE id = ANY($1::uuid[])", [[old.user.id, oldAccount]]);
    await db.query("UPDATE users SET last_seen_at = now() - interval '89 days' WHERE id = $1", [recent.user.id]);

    const result = await cleanupInactiveGuests(app.log);
    assert.equal(result.users, 1);
    assert.equal(result.images, 1);
    assert.equal(result.failed, 0);
    const left = (await db.query("SELECT id FROM users WHERE id = ANY($1::uuid[])", [[old.user.id, recent.user.id, oldAccount]])).rows.map((r) => r.id);
    assert.deepEqual(left.sort(), [recent.user.id, oldAccount].sort(), "restano l'ospite recente e l'account, anche se inattivo");
    assert.equal(existsSync(join(UPLOADS, saved.key)), false, "foto cancellata");
    assert.equal((await db.query("SELECT count(*)::int AS n FROM items WHERE user_id = $1", [old.user.id])).rows[0].n, 0);
    assert.equal((await get("/auth/me", old.token)).statusCode, 401, "il vecchio accesso non vale più");
  });

  test("il database rifiuta un account senza credenziali che non sia un ospite", async () => {
    await assert.rejects((await pool()).query("INSERT INTO users (is_guest) VALUES (false)"), /users_guest_or_credentials/);
  });
});
