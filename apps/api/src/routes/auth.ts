import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createUser, findUserByEmail, findUserById } from "../repositories/users.js";

const CredentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri").max(128),
  displayName: z.string().trim().max(60).optional(),
});

function publicUser(u: { id: string; email: string; display_name: string | null }) {
  return { id: u.id, email: u.email, displayName: u.display_name };
}

export default async function authRoutes(app: FastifyInstance) {
  // Tighter limit on credential endpoints to slow down brute force.
  const rateLimit = { max: 10, timeWindow: "1 minute" };

  app.post("/auth/register", { config: { rateLimit } }, async (request, reply) => {
    const body = CredentialsSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? "Dati non validi" });
    }
    const { email, password, displayName } = body.data;
    if (await findUserByEmail(email)) {
      return reply.code(409).send({ error: "Esiste già un account con questa email." });
    }
    const user = await createUser(email, await bcrypt.hash(password, 12), displayName || null);
    const token = app.jwt.sign({ sub: user.id, email: user.email });
    return reply.code(201).send({ token, user: publicUser(user) });
  });

  app.post("/auth/login", { config: { rateLimit } }, async (request, reply) => {
    const body = CredentialsSchema.pick({ email: true, password: true }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Email o password non valide." });

    const user = await findUserByEmail(body.data.email);
    const ok = user && (await bcrypt.compare(body.data.password, user.password_hash));
    if (!user || !ok) return reply.code(401).send({ error: "Email o password non corrette." });

    const token = app.jwt.sign({ sub: user.id, email: user.email });
    return { token, user: publicUser(user) };
  });

  app.get("/auth/me", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = await findUserById(request.user.sub);
    if (!user) return reply.code(401).send({ error: "Utente non trovato." });
    return { user: publicUser(user) };
  });
}
