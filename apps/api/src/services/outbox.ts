import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { publishToOrg } from "../realtime/socket";

const POLL_INTERVAL_MS = 1000;
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 12;
export const OUTBOX_LEASE_MS = 30_000;

let timer: NodeJS.Timeout | null = null;

/**
 * Claim with a short MySQL row-locking transaction. SKIP LOCKED lets separate
 * API workers make progress without taking the same pending rows. A claim
 * token fences acknowledgements from a worker whose lease has expired.
 */
export async function claimOutboxBatch(
  workerToken = randomUUID(),
  now = new Date(),
  batchSize = BATCH_SIZE,
  leaseMs = OUTBOX_LEASE_MS,
  orgId?: string
) {
  return prisma.$transaction(async (tx) => {
    const orgFilter = orgId ? Prisma.sql`AND orgId = ${orgId}` : Prisma.empty;
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM outbox_events
      WHERE ((status = 'PENDING' AND availableAt <= ${now})
         OR (status = 'CLAIMED' AND claimedUntil <= ${now}))
      ${orgFilter}
      ORDER BY createdAt ASC, id ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    `);
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) return [];

    await tx.outboxEvent.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "CLAIMED",
        claimToken: workerToken,
        claimedUntil: new Date(now.getTime() + leaseMs),
      },
    });

    return tx.outboxEvent.findMany({
      where: { status: "CLAIMED", claimToken: workerToken },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  });
}

export async function acknowledgeOutboxEvent(id: string, workerToken: string, now = new Date()) {
  const result = await prisma.outboxEvent.updateMany({
    where: { id, status: "CLAIMED", claimToken: workerToken },
    data: {
      status: "PUBLISHED",
      publishedAt: now,
      lastError: null,
      claimToken: null,
      claimedUntil: null,
    },
  });
  return result.count === 1;
}

export async function releaseOutboxEvent(
  event: { id: string; attempts: number },
  workerToken: string,
  error: unknown,
  now = new Date()
) {
  const attempts = event.attempts + 1;
  const backoffMs = Math.min(60_000, 500 * 2 ** Math.min(attempts, 7));
  const result = await prisma.outboxEvent.updateMany({
    where: { id: event.id, status: "CLAIMED", claimToken: workerToken },
    data: {
      attempts,
      status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
      availableAt: new Date(now.getTime() + backoffMs),
      claimToken: null,
      claimedUntil: null,
      lastError: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
    },
  });
  return result.count === 1;
}

/**
 * The database claim is safe across processes. Socket.IO publication remains
 * at-least-once submission: a crash after emit and before acknowledgement can
 * re-emit after lease expiry, so clients receive a stable eventId for dedupe.
 */
export async function drainOutbox(): Promise<number> {
  const workerToken = randomUUID();
  let published = 0;
  try {
    const events = await claimOutboxBatch(workerToken);
    for (const event of events) {
      try {
        if (!publishToOrg(event.orgId, event.topic, event.payload, event.id)) {
          throw new Error("Realtime server is not initialized");
        }
        if (await acknowledgeOutboxEvent(event.id, workerToken)) published += 1;
      } catch (err) {
        await releaseOutboxEvent(event, workerToken, err);
      }
    }
  } catch (err) {
    logger.error({ err }, "Outbox drain failed");
  }
  return published;
}

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

export async function outboxBacklog(): Promise<{ pending: number; claimed: number; failed: number }> {
  const [pending, claimed, failed] = await Promise.all([
    prisma.outboxEvent.count({ where: { status: "PENDING" } }),
    prisma.outboxEvent.count({ where: { status: "CLAIMED" } }),
    prisma.outboxEvent.count({ where: { status: "FAILED" } }),
  ]);
  return { pending, claimed, failed };
}
