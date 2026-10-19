import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as admin from "../repositories/admin.js";
import { storage } from "../services/storage.js";

export default async function adminRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.requireAdmin);

  app.get("/admin/stats", async () => admin.getStats());

  app.get("/admin/users", async () => ({ users: await admin.listUsers() }));

  app.get("/admin/items", async (request, reply) => {
    const q = z
      .object({
        limit: z.coerce.number().int().min(1).max(200).default(60),
        userId: z.uuid().optional(),
      })
      .safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: "Parametri non validi" });
    return { items: await admin.listRecentItems(q.data.limit, q.data.userId) };
  });

  app.delete("/admin/users/:id", async (request, reply) => {
    const params = z.object({ id: z.uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "ID non valido" });
    if (params.data.id === request.user.sub) {
      return reply.code(400).send({ error: "Non puoi eliminare il tuo account da qui." });
    }
    const imageKeys = await admin.deleteUser(params.data.id);
    if (!imageKeys) return reply.code(404).send({ error: "Utente non trovato" });
    await Promise.allSettled(imageKeys.map((key) => storage.remove(key)));
    return reply.code(204).send();
  });
}
