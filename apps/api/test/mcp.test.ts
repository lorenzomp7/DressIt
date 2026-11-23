// Test del server MCP (/mcp) con il client ufficiale dell'SDK, su un server HTTP vero.
// - Sempre: autenticazione, metodi non consentiti, elenco degli strumenti.
// - Con TEST_DATABASE_URL (un database usa e getta il cui nome contiene "test"): capi solo
//   dell'utente, log_wear, suggest_outfit con Gemini simulato in locale (GEMINI_BASE_URL).
//   In CI il database lo fornisce il servizio Postgres del job; in locale, per esempio:
//   TEST_DATABASE_URL=postgres://dressit@127.0.0.1:5432/dressit_test npm test
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FastifyInstance } from "fastify";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB && !/test/i.test(new URL(TEST_DB).pathname)) {
  throw new Error("TEST_DATABASE_URL deve puntare a un database di test (il nome deve contenere 'test'): i test lo svuotano");
}

// Gemini simulato: risponde a qualsiasi generateContent con l'outfit impostato dal test.
let geminiOutfitIds: string[] = [];
let geminiCalls = 0;
const gemini: Server = createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    geminiCalls++;
    const text = JSON.stringify({
      reply: "Ecco una proposta.",
      outfits: [{ title: "Prova", item_ids: geminiOutfitIds, explanation: "Test", missing_piece: "" }],
    });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }] }));
  });
});
await new Promise<void>((resolve) => gemini.listen(0, "127.0.0.1", resolve));

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: TEST_DB ?? "postgres://test:test@127.0.0.1:1/dressit_test",
  JWT_SECRET: "test-secret-di-almeno-trentadue-caratteri",
  GEMINI_API_KEY: "test",
  GEMINI_BASE_URL: `http://127.0.0.1:${(gemini.address() as AddressInfo).port}`,
  UPLOAD_DIR: mkdtempSync(join(tmpdir(), "dressit-uploads-")),
  CORS_ORIGIN: "http://localhost:3000",
});
delete process.env.CLOUDINARY_URL;

let app: FastifyInstance;
let url: URL;
const USER_A = "00000000-0000-4000-8000-00000000000a";
const USER_B = "00000000-0000-4000-8000-00000000000b";
const token = (sub: string) => app.jwt.sign({ sub, email: `${sub.slice(-1)}@example.test` });

before(async () => {
  const { buildApp } = await import("../src/app.js");
  app = await buildApp();
  await app.listen({ port: 0, host: "127.0.0.1" });
  url = new URL(`http://127.0.0.1:${(app.server.address() as AddressInfo).port}/mcp`);
});

after(async () => {
  await app?.close();
  const { pool } = await import("../src/db/pool.js");
  await pool.end();
  gemini.close();
});

async function connect(sub: string): Promise<Client> {
  const client = new Client({ name: "dressit-test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(url, { requestInit: { headers: { authorization: `Bearer ${token(sub)}` } } }),
  );
  return client;
}

/** JSON of a successful tool call (the tools answer with one text block). */
async function call(client: Client, name: string, args: Record<string, unknown>) {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { type: string; text: string }[])[0]?.text ?? "";
  return { isError: Boolean(res.isError), text, data: res.isError ? null : JSON.parse(text) };
}

test("/mcp senza token o con token falso risponde 401 con la sfida Bearer", async () => {
  for (const authorization of [undefined, "Bearer token.non.valido"]) {
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { accept: "application/json, text/event-stream", ...(authorization ? { authorization } : {}) },
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    assert.equal(res.statusCode, 401);
    assert.match(String(res.headers["www-authenticate"]), /^Bearer/);
  }
});

test("/mcp accetta solo POST: GET e DELETE rispondono 405", async () => {
  for (const method of ["GET", "DELETE"] as const) {
    const res = await app.inject({ method, url: "/mcp", headers: { authorization: `Bearer ${token(USER_A)}` } });
    assert.equal(res.statusCode, 405, method);
    assert.equal(res.headers.allow, "POST");
  }
});

test("il client MCP vede i tre strumenti con i loro schemi", async () => {
  const client = await connect(USER_A);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["list_items", "log_wear", "suggest_outfit"]);
  const logWear = tools.find((t) => t.name === "log_wear");
  assert.deepEqual(logWear?.inputSchema.required, ["item_ids"]);
  assert.equal(tools.find((t) => t.name === "list_items")?.annotations?.readOnlyHint, true);
  await client.close();
});

test("argomenti non validi vengono rifiutati prima di toccare il database", async () => {
  const client = await connect(USER_A);
  const badId = await client.callTool({ name: "log_wear", arguments: { item_ids: ["non-un-uuid"] } });
  assert.equal(badId.isError, true);
  const badZone = await client.callTool({
    name: "suggest_outfit",
    arguments: { occasion: "cena", timezone: "Europe/Atlantide" },
  });
  assert.equal(badZone.isError, true);
  const future = await call(client, "log_wear", { item_ids: [USER_A], date: "2999-01-01" });
  assert.equal(future.isError, true);
  assert.match(future.text, /futuro/);
  await client.close();
});

test("il limite dello stylist conta per utente e si libera dopo un minuto", async () => {
  const { takeStylistCall } = await import("../src/routes/mcp.js");
  const t0 = 1_000_000;
  for (let i = 0; i < 15; i++) assert.equal(takeStylistCall("limite-x", t0 + i), true);
  assert.equal(takeStylistCall("limite-x", t0 + 100), false);
  assert.equal(takeStylistCall("limite-y", t0 + 100), true);
  assert.equal(takeStylistCall("limite-x", t0 + 61_000), true);
});

describe("con il database di test", { skip: TEST_DB ? false : "TEST_DATABASE_URL non impostata" }, () => {
  const ids: Record<string, string> = {};

  before(async () => {
    const { migrate } = await import("../src/db/migrate.js");
    const { pool } = await import("../src/db/pool.js");
    await migrate();
    await pool.query("TRUNCATE users CASCADE");
    await pool.query(
      `INSERT INTO users (id, email, password_hash) VALUES ($1, 'a@example.test', 'x'), ($2, 'b@example.test', 'x')`,
      [USER_A, USER_B],
    );
    const add = async (key: string, user: string, name: string, category: string, seasons: string[], colors: string[]) => {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO items (user_id, image_url, image_key, name, category, seasons, colors)
         VALUES ($1, 'http://localhost/uploads/x.jpg', 'x.jpg', $2, $3, $4, $5) RETURNING id`,
        [user, name, category, seasons, colors],
      );
      ids[key] = rows[0]!.id;
    };
    await add("camicia", USER_A, "Camicia azzurra di lino", "top", ["summer"], ["azzurro"]);
    await add("jeans", USER_A, "Jeans scuri", "bottom", ["spring", "autumn"], ["blu"]);
    await add("cappotto", USER_A, "Cappotto di lana", "outerwear", ["winter"], ["grigio"]);
    await add("altrui", USER_B, "Giacca di B", "outerwear", ["winter"], ["nero"]);
  });

  test("list_items restituisce solo i capi dell'utente, filtrabili", async () => {
    const a = await connect(USER_A);
    const all = await call(a, "list_items", {});
    assert.equal(all.data.total, 3);
    assert.ok(all.data.items.every((i: { id: string }) => i.id !== ids.altrui));
    assert.ok(all.data.items.every((i: Record<string, unknown>) => !("userId" in i) && !("imageKey" in i)));
    assert.deepEqual((await call(a, "list_items", { category: "outerwear" })).data.items.map((i: { id: string }) => i.id), [ids.cappotto]);
    assert.equal((await call(a, "list_items", { season: "summer" })).data.total, 1);
    assert.equal((await call(a, "list_items", { search: "LINO" })).data.items[0].id, ids.camicia);
    assert.equal((await call(a, "list_items", { limit: 1 })).data.items.length, 1);
    await a.close();

    const b = await connect(USER_B);
    assert.deepEqual((await call(b, "list_items", {})).data.items.map((i: { id: string }) => i.id), [ids.altrui]);
    await b.close();
  });

  test("log_wear registra il look, non crea doppioni e rifiuta capi altrui", async () => {
    const { pool } = await import("../src/db/pool.js");
    const a = await connect(USER_A);
    const wearRows = async () =>
      Number((await pool.query("SELECT count(*) FROM item_wear_history")).rows[0].count);

    const foreign = await call(a, "log_wear", { item_ids: [ids.camicia, ids.altrui] });
    assert.equal(foreign.isError, true);
    assert.equal(await wearRows(), 0, "nessun capo registrato se uno non è dell'utente");

    const today = await call(a, "log_wear", { item_ids: [ids.camicia, ids.jeans, ids.camicia] });
    assert.equal(today.data.recorded, 2);
    await call(a, "log_wear", { item_ids: [ids.camicia, ids.jeans] });
    assert.equal(await wearRows(), 2, "ripetere lo stesso giorno non crea doppioni");

    const lastBefore = (await pool.query("SELECT last_worn_at FROM items WHERE id = $1", [ids.camicia])).rows[0].last_worn_at;
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(Date.now() - 3 * 86_400_000));
    const past = await call(a, "log_wear", { item_ids: [ids.camicia], date: day });
    assert.equal(past.data.date, day);
    const { rows } = await pool.query(
      "SELECT worn_on::text AS d, i.last_worn_at FROM item_wear_history h JOIN items i ON i.id = h.item_id WHERE h.item_id = $1 ORDER BY d",
      [ids.camicia],
    );
    assert.equal(rows[0].d, day);
    assert.deepEqual(rows[0].last_worn_at, lastBefore, "un giorno passato non sposta indietro l'ultima volta indossato");

    const tooOld = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(Date.now() - 40 * 86_400_000));
    assert.equal((await call(a, "log_wear", { item_ids: [ids.camicia], date: tooOld })).isError, true);
    await a.close();
  });

  test("suggest_outfit usa lo stylist e scarta gli id non dell'utente", async () => {
    const a = await connect(USER_A);
    geminiOutfitIds = [ids.camicia!, ids.altrui!, "inventato"];
    const before = geminiCalls;
    const res = await call(a, "suggest_outfit", { occasion: "aperitivo estivo" });
    assert.equal(geminiCalls, before + 1);
    assert.equal(res.data.reply, "Ecco una proposta.");
    assert.deepEqual(res.data.outfits[0].items.map((i: { id: string }) => i.id), [ids.camicia]);

    geminiOutfitIds = [ids.altrui!];
    assert.deepEqual((await call(a, "suggest_outfit", { occasion: "serata" })).data.outfits, [], "outfit senza capi propri scartati");
    await a.close();
  });

  test("POST /outfits/suggest dà lo stesso risultato dopo lo spostamento nel servizio", async () => {
    geminiOutfitIds = [ids.jeans!, ids.altrui!];
    const res = await app.inject({
      method: "POST",
      url: "/outfits/suggest",
      headers: { authorization: `Bearer ${token(USER_A)}` },
      payload: { message: "ufficio" },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().outfits[0].items.map((i: { id: string }) => i.id), [ids.jeans]);
  });
});
