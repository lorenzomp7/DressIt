// Test HTTP dell'API senza database né chiavi reali: il database punta a una porta
// chiusa, quindi qui si verificano autenticazione e validazione degli input, che
// avvengono prima di qualsiasi query.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://test:test@127.0.0.1:1/dressit_test",
  JWT_SECRET: "test-secret-di-almeno-trentadue-caratteri",
  GEMINI_API_KEY: "test",
  UPLOAD_DIR: mkdtempSync(join(tmpdir(), "dressit-uploads-")),
  ADMIN_EMAILS: "admin@example.com",
  CORS_ORIGIN: "http://localhost:3000",
});
delete process.env.CLOUDINARY_URL;

let app: FastifyInstance;
let userToken: string;
const ITEM_ID = "3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";

before(async () => {
  const { buildApp } = await import("../src/app.js");
  app = await buildApp();
  await app.ready();
  userToken = app.jwt.sign({ sub: "00000000-0000-4000-8000-000000000001", email: "utente@example.com" });
});

after(async () => {
  await app?.close();
  const { pool } = await import("../src/db/pool.js");
  await pool.end();
});

const auth = (token = userToken) => ({ authorization: `Bearer ${token}` });

test("/health segnala database non raggiungibile con 503", async () => {
  const res = await app.inject({ method: "GET", url: "/health" });
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.json(), { status: "degraded", database: "unreachable" });
});

test("le rotte protette rispondono 401 senza token o con token non valido", async () => {
  for (const url of ["/items", "/auth/me", "/weather?lat=45&lon=9"]) {
    assert.equal((await app.inject({ method: "GET", url })).statusCode, 401, url);
  }
  const forged = await app.inject({ method: "GET", url: "/items", headers: auth("token.non.valido") });
  assert.equal(forged.statusCode, 401);
});

test("le rotte admin rispondono 403 a un utente normale", async () => {
  const res = await app.inject({ method: "GET", url: "/admin/stats", headers: auth() });
  assert.equal(res.statusCode, 403);
});

test("login e registrazione validano i dati prima di interrogare il database", async () => {
  const login = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "non-una-email", password: "x" } });
  assert.equal(login.statusCode, 400);
  const register = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: { email: "nuovo@example.com", password: "corta" },
  });
  assert.equal(register.statusCode, 400);
  assert.match(register.json().error, /almeno 8 caratteri/);
});

test("i capi rifiutano ID non validi e modifiche fuori scala", async () => {
  const badId = await app.inject({ method: "GET", url: "/items/123", headers: auth() });
  assert.equal(badId.statusCode, 400);
  const badWarmth = await app.inject({
    method: "PATCH",
    url: `/items/${ITEM_ID}`,
    headers: auth(),
    payload: { warmth: 9 },
  });
  assert.equal(badWarmth.statusCode, 400);
});

test("'indossato oggi' richiede ID validi e un fuso orario esistente", async () => {
  const empty = await app.inject({ method: "POST", url: "/items/wear", headers: auth(), payload: { itemIds: [] } });
  assert.equal(empty.statusCode, 400);
  const badZone = await app.inject({
    method: "POST",
    url: "/items/wear",
    headers: auth(),
    payload: { itemIds: [ITEM_ID], timezone: "Europe/Atlantide" },
  });
  assert.equal(badZone.statusCode, 400);
});

test("meteo e suggerimenti validano coordinate e messaggio", async () => {
  const weather = await app.inject({ method: "GET", url: "/weather?lat=999&lon=9", headers: auth() });
  assert.equal(weather.statusCode, 400);
  const suggest = await app.inject({
    method: "POST",
    url: "/outfits/suggest",
    headers: auth(),
    payload: { message: "   " },
  });
  assert.equal(suggest.statusCode, 400);
});
