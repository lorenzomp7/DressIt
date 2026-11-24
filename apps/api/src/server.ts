import { buildApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db/pool.js";
import { scheduleGuestCleanup } from "./services/guestCleanup.js";

const app = await buildApp();

try {
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

const stopGuestCleanup = scheduleGuestCleanup(app.log);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    app.log.info(`${signal} received, shutting down`);
    stopGuestCleanup();
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
