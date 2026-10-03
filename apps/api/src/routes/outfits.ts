import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listItems } from "../repositories/items.js";
import { AiError, suggestOutfits } from "../services/ai.js";
import { getWeather } from "../services/weather.js";

const SuggestSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(40)
    .default([]),
  location: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).optional(),
  timezone: z.string().max(64).default("Europe/Rome"),
});

export default async function outfitRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/weather", async (request, reply) => {
    const q = z
      .object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) })
      .safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: "Coordinate non valide" });
    const weather = await getWeather(q.data.lat, q.data.lon);
    return weather ? { weather } : reply.code(502).send({ error: "Meteo non disponibile" });
  });

  app.post(
    "/outfits/suggest",
    { config: { rateLimit: { max: 15, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = SuggestSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: "Richiesta non valida" });
      const { message, location, timezone } = body.data;

      const wardrobe = await listItems(request.user.sub);
      if (wardrobe.length === 0) {
        return {
          reply: "Il tuo guardaroba è ancora vuoto! Fotografa qualche capo e poi chiedimi un outfit.",
          outfits: [],
          weather: null,
        };
      }

      // Keep the most recent turns, and make sure the conversation starts with a user turn.
      let history = body.data.history.slice(-12);
      while (history[0]?.role === "assistant") history = history.slice(1);

      const weather = location ? await getWeather(location.lat, location.lon) : null;

      try {
        const result = await suggestOutfits({ message, history, wardrobe, weather, timezone });

        // Never trust IDs coming back from the model: keep only items the user owns.
        const byId = new Map(wardrobe.map((i) => [i.id, i]));
        const outfits = result.outfits
          .map((o) => ({
            title: o.title,
            explanation: o.explanation,
            missingPiece: o.missing_piece || null,
            items: [...new Set(o.item_ids)].flatMap((id) => byId.get(id) ?? []),
          }))
          .filter((o) => o.items.length > 0)
          .slice(0, 3);

        return { reply: result.reply, outfits, weather };
      } catch (err) {
        if (err instanceof AiError) return reply.code(err.statusCode).send({ error: err.message });
        throw err;
      }
    },
  );
}
