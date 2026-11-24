import type { FastifyBaseLogger } from "fastify";
import { config } from "../config.js";
import { deleteInactiveGuests } from "../repositories/users.js";
import { storage } from "./storage.js";

/** Delete guests idle for more than GUEST_INACTIVE_DAYS, with their photos. Accounts are never touched. */
export async function cleanupInactiveGuests(log: FastifyBaseLogger, days = config.GUEST_INACTIVE_DAYS) {
  const { users, imageKeys } = await deleteInactiveGuests(days);
  const removed = await Promise.allSettled(imageKeys.map((key) => storage.remove(key)));
  const failed = removed.filter((r) => r.status === "rejected").length;
  if (users > 0) log.info({ users, images: imageKeys.length, failed }, "inactive guests deleted");
  return { users, images: imageKeys.length, failed };
}

/** Once shortly after start, then every 24 hours. The timers never keep the process alive. */
export function scheduleGuestCleanup(log: FastifyBaseLogger): () => void {
  const run = () => void cleanupInactiveGuests(log).catch((err) => log.error({ err }, "guest cleanup failed"));
  const first = setTimeout(run, 60_000);
  const daily = setInterval(run, 24 * 60 * 60 * 1000);
  first.unref();
  daily.unref();
  return () => {
    clearTimeout(first);
    clearInterval(daily);
  };
}
