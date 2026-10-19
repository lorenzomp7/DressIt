import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ItemUpdateSchema } from "../domain.js";
import { trackAi } from "../repositories/aiEvents.js";
import * as items from "../repositories/items.js";
import { AiError, tagGarment } from "../services/ai.js";
import { normalizeImage } from "../services/image.js";
import { storage } from "../services/storage.js";

const IdParams = z.object({ id: z.uuid() });
const ALLOWED_MIME = /^image\/(jpeg|png|webp|heic|heif|avif)$/;

export default async function itemRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.authenticate);

  app.get("/items", async (request) => {
    return { items: await items.listItems(request.user.sub) };
  });

  app.get("/items/:id", async (request, reply) => {
    const params = IdParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "ID non valido" });
    const item = await items.getItem(request.user.sub, params.data.id);
    return item ? { item } : reply.code(404).send({ error: "Capo non trovato" });
  });

  /** Upload a photo → normalize → AI tagging + storage in parallel → save. */
  app.post(
    "/items",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const file = await request.file();
      if (!file) return reply.code(400).send({ error: "Nessuna immagine ricevuta." });
      if (!ALLOWED_MIME.test(file.mimetype)) {
        return reply.code(415).send({ error: "Formato immagine non supportato." });
      }

      let image;
      try {
        image = await normalizeImage(await file.toBuffer());
      } catch (err) {
        if ((err as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
          return reply.code(413).send({ error: "Immagine troppo grande (max 10 MB)." });
        }
        return reply.code(422).send({ error: "Impossibile leggere l'immagine." });
      }

      const userId = request.user.sub;
      const [tagging, stored] = await Promise.allSettled([
        trackAi(userId, "tag", () => tagGarment(image.buffer, image.mediaType)),
        storage.save(userId, image.buffer),
      ]);

      if (tagging.status === "rejected" || stored.status === "rejected") {
        if (stored.status === "fulfilled") await storage.remove(stored.value.key).catch(() => {});
        const err = tagging.status === "rejected" ? tagging.reason : stored.status === "rejected" ? stored.reason : null;
        request.log.error({ err }, "item creation failed");
        if (err instanceof AiError) return reply.code(err.statusCode).send({ error: err.message });
        return reply.code(500).send({ error: "Salvataggio dell'immagine non riuscito." });
      }

      const item = await items.createItem(userId, stored.value, tagging.value);
      return reply.code(201).send({ item });
    },
  );

  app.patch("/items/:id", async (request, reply) => {
    const params = IdParams.safeParse(request.params);
    const body = ItemUpdateSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "Dati non validi" });
    const item = await items.updateItem(request.user.sub, params.data.id, body.data);
    return item ? { item } : reply.code(404).send({ error: "Capo non trovato" });
  });

  app.delete("/items/:id", async (request, reply) => {
    const params = IdParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "ID non valido" });
    const item = await items.deleteItem(request.user.sub, params.data.id);
    if (!item) return reply.code(404).send({ error: "Capo non trovato" });
    await storage.remove(item.imageKey).catch((err) => request.log.warn({ err }, "image cleanup failed"));
    return reply.code(204).send();
  });

  /** Mark the items of a chosen outfit as worn today (feeds variety in suggestions). */
  app.post("/items/wear", async (request, reply) => {
    const body = z.object({ itemIds: z.array(z.uuid()).min(1).max(20) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Dati non validi" });
    const updated = await items.markWorn(request.user.sub, body.data.itemIds);
    return { updated };
  });
}
