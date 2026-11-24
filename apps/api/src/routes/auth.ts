import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { isAdmin } from "../plugins/auth.js";
import {
  createGuest,
  createUser,
  findUserByEmail,
  findUserById,
  touchUser,
  upgradeGuest,
  type UserRow,
} from "../repositories/users.js";

const CredentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri").max(128),
  displayName: z.string().trim().max(60).optional(),
});

function publicUser(u: UserRow) {
  return { id: u.id, email: u.email, displayName: u.display_name, isAdmin: isAdmin(u.email), isGuest: u.is_guest };
}

export default async function authRoutes(app: FastifyInstance) {
  // Tighter limit on credential endpoints to slow down brute force.
  const rateLimit = { max: 10, timeWindow: "1 minute" };

  /** Account tokens last 30 days (plugin default); guest tokens as long as guests are kept. */
  const tokenFor = (u: UserRow) =>
    u.is_guest
      ? app.jwt.sign({ sub: u.id, guest: true }, { expiresIn: `${config.GUEST_INACTIVE_DAYS}d` })
      : app.jwt.sign({ sub: u.id, email: u.email! });

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
    return reply.code(201).send({ token: tokenFor(user), user: publicUser(user) });
  });

  app.post("/auth/login", { config: { rateLimit } }, async (request, reply) => {
    const body = CredentialsSchema.pick({ email: true, password: true }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Email o password non valide." });

    const user = await findUserByEmail(body.data.email);
    const ok = user?.password_hash && (await bcrypt.compare(body.data.password, user.password_hash));
    if (!user || !ok) return reply.code(401).send({ error: "Email o password non corrette." });

    return { token: tokenFor(user), user: publicUser(user) };
  });

  // "Continua come ospite": no data asked. Each call creates a user, so the limit is per hour.
  app.post("/auth/guest", { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (_request, reply) => {
    const user = await createGuest();
    return reply.code(201).send({ token: tokenFor(user), user: publicUser(user) });
  });

  // A guest creates an account: same user id, so wardrobe and wear history stay.
  app.post("/auth/upgrade", { config: { rateLimit }, onRequest: [app.authenticate] }, async (request, reply) => {
    const body = CredentialsSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? "Dati non validi" });
    }
    const { email, password, displayName } = body.data;
    const result = await upgradeGuest(request.user.sub, email, await bcrypt.hash(password, 12), displayName || null);
    if (result === "taken") return reply.code(409).send({ error: "Esiste già un account con questa email." });
    if (!result) return reply.code(409).send({ error: "Hai già un account." });
    return { token: tokenFor(result), user: publicUser(result) };
  });

  // Called at each app start. For guests it also renews the token, so their access only
  // expires after GUEST_INACTIVE_DAYS without opening the app, like the cleanup.
  app.get("/auth/me", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = await findUserById(request.user.sub);
    if (!user) return reply.code(401).send({ error: "Utente non trovato." });
    await touchUser(user.id);
    return user.is_guest ? { user: publicUser(user), token: tokenFor(user) } : { user: publicUser(user) };
  });
}
