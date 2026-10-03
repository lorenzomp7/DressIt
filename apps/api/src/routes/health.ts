import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";

export default async function healthRoutes(app: FastifyInstance) {
  app.get("/health", { config: { rateLimit: false } }, async (_req, reply) => {
    try {
      await pool.query("SELECT 1");
      return { status: "ok" };
    } catch {
      return reply.code(503).send({ status: "degraded", database: "unreachable" });
    }
  });
}
