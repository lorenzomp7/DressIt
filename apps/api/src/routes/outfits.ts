import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AiError } from "../services/ai.js";
import { suggestForUser } from "../services/stylist.js";
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
      try {
        return await suggestForUser(request.user.sub, body.data);
      } catch (err) {
        if (err instanceof AiError) return reply.code(err.statusCode).send({ error: err.message });
        throw err;
      }
    },
  );
}
