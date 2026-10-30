import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { publishToOrg } from "../realtime/socket";

const POLL_INTERVAL_MS = 1000;
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 12;

let timer: NodeJS.Timeout | null = null;
let running = false;

/**
 * Transactional outbox pattern: domain transactions only write an outbox row.
 * This worker is the single place that publishes to Socket.IO, so a client can
 * never receive an event for a transaction that later rolled back.
 */
export function startOutboxWorker(): void {
  if (timer) return;
  timer = setInterval(() => void drainOutbox(), POLL_INTERVAL_MS);
  timer.unref();
  void drainOutbox();
  logger.info("Outbox worker started");
}

export function stopOutboxWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export async function drainOutbox(): Promise<number> {
  if (running) return 0;
  running = true;
  let published = 0;
  try {
    const events = await prisma.outboxEvent.findMany({
      where: { status: "PENDING", availableAt: { lte: new Date() } },
      orderBy: { createdAt: "asc" },
      take: BATCH_SIZE,
    });

    for (const event of events) {
      try {
        publishToOrg(event.orgId, event.topic, event.payload);
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: "PUBLISHED", publishedAt: new Date(), lastError: null },
        });
        published += 1;
      } catch (err) {
        const attempts = event.attempts + 1;
        const backoffMs = Math.min(60_000, 500 * 2 ** Math.min(attempts, 7));
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            attempts,
            status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
            availableAt: new Date(Date.now() + backoffMs),
            lastError: err instanceof Error ? err.message.slice(0, 1000) : String(err),
          },
        });
      }
    }
  } catch (err) {
    logger.error({ err }, "Outbox drain failed");
  } finally {
    running = false;
  }
  return published;
}

export async function outboxBacklog(): Promise<{ pending: number; failed: number }> {
  const [pending, failed] = await Promise.all([
    prisma.outboxEvent.count({ where: { status: "PENDING" } }),
    prisma.outboxEvent.count({ where: { status: "FAILED" } }),
  ]);
  return { pending, failed };
}
