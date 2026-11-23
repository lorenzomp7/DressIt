// Server MCP (Model Context Protocol) di DressIt: l'armadio dell'utente usabile da Claude o da altri
// assistenti, senza aprire la PWA. Trasporto Streamable HTTP senza sessioni: ogni POST /mcp crea un
// server legato all'utente del JWT, quindi ogni strumento vede solo i capi di quell'utente.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CATEGORIES, FORMALITY, SEASONS, type Item } from "../domain.js";
import * as items from "../repositories/items.js";
import { AiError } from "../services/ai.js";
import { suggestForUser, type StylistResult } from "../services/stylist.js";

/** Same budget as POST /outfits/suggest, counted per user: each call spends Gemini tokens. */
const STYLIST_CALLS_PER_MINUTE = 15;
/** How far back log_wear accepts a day: the stylist only remembers the last 30 days. */
const MAX_WEAR_DAYS_BACK = 30;

const stylistCalls = new Map<string, number[]>();

/** In-memory sliding window: the API runs as a single container on the VM. */
export function takeStylistCall(userId: string, now = Date.now()): boolean {
  const recent = (stylistCalls.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= STYLIST_CALLS_PER_MINUTE) {
    stylistCalls.set(userId, recent);
    return false;
  }
  recent.push(now);
  stylistCalls.set(userId, recent);
  return true;
}

const TimeZone = z
  .string()
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("it-IT", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Fuso orario non valido")
  .default("Europe/Rome")
  .describe("Fuso orario IANA dell'utente, di base Europe/Rome");

/** Calendar day (YYYY-MM-DD) in a timezone, `daysBack` days ago. */
function dayIn(timezone: string, daysBack = 0): string {
  const d = new Date(Date.now() - daysBack * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** What a client may see of a garment: no owner id or storage key. */
function publicItem(i: Item) {
  return {
    id: i.id,
    name: i.name,
    category: i.category,
    subcategory: i.subcategory,
    colors: i.colors,
    pattern: i.pattern,
    material: i.material,
    seasons: i.seasons,
    formality: i.formality,
    warmth: i.warmth,
    tags: i.tags,
    description: i.description,
    lastWornAt: i.lastWornAt,
    imageUrl: i.imageUrl,
  };
}

const json = (data: unknown): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(data) }] });
const toolError = (message: string): CallToolResult => ({ isError: true, content: [{ type: "text", text: message }] });

function stylistJson(result: StylistResult) {
  return {
    reply: result.reply,
    weather: result.weather,
    outfits: result.outfits.map((o) => ({
      title: o.title,
      explanation: o.explanation,
      missingPiece: o.missingPiece,
      items: o.items.map((i) => ({ id: i.id, name: i.name, category: i.category, imageUrl: i.imageUrl })),
    })),
  };
}

export function buildMcpServer(userId: string): McpServer {
  const server = new McpServer(
    { name: "dressit", version: "1.0.0" },
    {
      instructions:
        "Armadio digitale DressIt dell'utente. list_items elenca i suoi capi; suggest_outfit chiede allo " +
        "stylist di DressIt degli outfit fatti solo con quei capi; log_wear segna che un look è stato " +
        "indossato. Usa gli id restituiti da list_items o da suggest_outfit, mai id inventati.",
    },
  );

  server.registerTool(
    "list_items",
    {
      title: "Capi dell'armadio",
      description: "Elenca i capi dell'utente, con filtri facoltativi. Restituisce JSON con id, nome, categoria, colori, stagioni, formalità, calore (1-5), ultima volta indossato e foto.",
      inputSchema: {
        category: z.enum(CATEGORIES).optional().describe("Solo questa categoria"),
        season: z.enum(SEASONS).optional().describe("Solo capi adatti a questa stagione"),
        formality: z.enum(FORMALITY).optional().describe("Solo questo livello di formalità"),
        search: z.string().trim().min(1).max(100).optional().describe("Testo da cercare in nome, sottocategoria, colori, materiale e tag"),
        limit: z.number().int().min(1).max(200).default(50).describe("Numero massimo di capi, di base 50"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ category, season, formality, search, limit }) => {
      const needle = search?.toLowerCase();
      const all = await items.listItems(userId);
      const found = all.filter(
        (i) =>
          (!category || i.category === category) &&
          (!season || i.seasons.includes(season)) &&
          (!formality || i.formality === formality) &&
          (!needle ||
            [i.name, i.subcategory, i.material, ...i.colors, ...i.tags].some((v) => v.toLowerCase().includes(needle))),
      );
      return json({ total: found.length, items: found.slice(0, limit).map(publicItem) });
    },
  );

  server.registerTool(
    "suggest_outfit",
    {
      title: "Stylist: proponi un outfit",
      description: "Chiede allo stylist di DressIt fino a 3 outfit per un'occasione, usando solo i capi dell'utente, la memoria degli ultimi utilizzi e, se c'è una posizione, il meteo. Usa l'AI: non chiamarlo in ciclo.",
      inputSchema: {
        occasion: z.string().trim().min(1).max(1000).describe("Cosa deve fare l'utente, es. 'cena fuori stasera, elegante ma comodo'"),
        location: z
          .object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) })
          .optional()
          .describe("Posizione per il meteo, facoltativa"),
        timezone: TimeZone,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ occasion, location, timezone }) => {
      if (!takeStylistCall(userId)) return toolError("Troppe richieste allo stylist: riprova tra un minuto.");
      try {
        const result = await suggestForUser(userId, { message: occasion, history: [], location, timezone });
        return json(stylistJson(result));
      } catch (err) {
        if (err instanceof AiError) return toolError(err.message);
        throw err;
      }
    },
  );

  server.registerTool(
    "log_wear",
    {
      title: "Segna un look come indossato",
      description: "Registra che l'utente ha indossato questi capi in un giorno (di base oggi). Si possono indicare giorni passati fino a 30 giorni fa. Ripeterlo per lo stesso giorno non crea doppioni. Tutti i capi devono essere dell'utente, altrimenti non registra nulla.",
      inputSchema: {
        item_ids: z.array(z.uuid()).min(1).max(20).describe("Id dei capi del look (da list_items o suggest_outfit)"),
        date: z.iso.date().optional().describe("Giorno YYYY-MM-DD, di base oggi nel fuso orario indicato"),
        timezone: TimeZone,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ item_ids, date, timezone }) => {
      const today = dayIn(timezone);
      const wornOn = date ?? today;
      if (wornOn > today) return toolError("Non si può segnare un giorno futuro.");
      if (wornOn < dayIn(timezone, MAX_WEAR_DAYS_BACK)) {
        return toolError(`Si possono segnare solo gli ultimi ${MAX_WEAR_DAYS_BACK} giorni.`);
      }
      const updated = await items.markWorn(userId, item_ids, timezone, date ? wornOn : undefined);
      if (updated === null) return toolError("Uno o più capi non trovati nell'armadio: non è stato registrato nulla.");
      return json({ recorded: updated, date: wornOn });
    },
  );

  return server;
}

export default async function mcpRoutes(app: FastifyInstance) {
  // MCP clients expect a Bearer challenge on 401 (MCP authorization spec, RFC 6750).
  app.addHook("onRequest", async (request, reply) => {
    reply.header("WWW-Authenticate", 'Bearer realm="dressit"');
    await app.authenticate(request, reply);
    if (!reply.sent) reply.removeHeader("WWW-Authenticate");
  });

  app.post("/mcp", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    const server = buildMcpServer(request.user.sub);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    reply.hijack();
    reply.raw.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
    } catch (err) {
      request.log.error({ err }, "mcp request failed");
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { "content-type": "application/json" });
        reply.raw.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Errore interno del server" }, id: null }));
      }
    }
  });

  // Stateless server: no server-initiated stream (GET) and no session to close (DELETE).
  const notAllowed = async (_request: unknown, reply: import("fastify").FastifyReply) =>
    reply
      .code(405)
      .header("Allow", "POST")
      .send({ jsonrpc: "2.0", error: { code: -32000, message: "Metodo non consentito: usa POST" }, id: null });
  app.get("/mcp", notAllowed);
  app.delete("/mcp", notAllowed);
}
