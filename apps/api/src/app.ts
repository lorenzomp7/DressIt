import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { mkdirSync } from "node:fs";
import { config } from "./config.js";
import authPlugin from "./plugins/auth.js";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import healthRoutes from "./routes/health.js";
import itemRoutes from "./routes/items.js";
import outfitRoutes from "./routes/outfits.js";
import { localStorage } from "./services/storage.js";

export async function buildApp() {
  const app = Fastify({
    logger: config.isProduction
      ? { level: "info" }
      : { level: "debug", transport: undefined },
    // Render terminates TLS at its proxy; trust X-Forwarded-* for client IPs (rate limiting).
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  await app.register(authPlugin);

  if (!config.useCloudinary) {
    mkdirSync(localStorage.root, { recursive: true });
    await app.register(fastifyStatic, {
      root: localStorage.root,
      prefix: "/uploads/",
      maxAge: "7d",
      immutable: true,
    });
  }

  app.setErrorHandler((err, request, reply) => {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) request.log.error({ err }, "unhandled error");
    reply.code(status).send({
      error: status >= 500 ? "Errore interno del server" : (err as Error).message,
    });
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(itemRoutes);
  await app.register(outfitRoutes);
  await app.register(adminRoutes);

  return app;
}
