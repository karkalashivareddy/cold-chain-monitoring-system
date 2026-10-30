import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import {
  acknowledgeOutboxEvent,
  claimOutboxBatch,
  OUTBOX_LEASE_MS,
  releaseOutboxEvent,
} from "../src/services/outbox";

const createdIds: string[] = [];
let testOrgId: string;

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: "Outbox concurrency test", slug: `outbox-${randomUUID().slice(0, 12)}` },
  });
  testOrgId = org.id;
});

async function createEvent(topic: string) {
  const event = await prisma.outboxEvent.create({
    data: { orgId: testOrgId, topic, payload: { test: true }, status: "PENDING" },
  });
  createdIds.push(event.id);
  return event;
}

afterAll(async () => {
  if (createdIds.length > 0) {
    await prisma.outboxEvent.deleteMany({ where: { id: { in: createdIds } } });
  }
  if (testOrgId!) await prisma.organization.delete({ where: { id: testOrgId } });
});

describe("transactional outbox multi-worker lease", () => {
  it("atomically gives concurrently polling workers disjoint rows", async () => {
    const events = await Promise.all(
      Array.from({ length: 6 }, (_, index) => createEvent(`worker-test-${index}-${randomUUID().slice(0, 8)}`))
    );
    const now = new Date();
    const [workerA, workerB] = await Promise.all([
      claimOutboxBatch("test-worker-a", now, 3, OUTBOX_LEASE_MS, testOrgId),
      claimOutboxBatch("test-worker-b", now, 3, OUTBOX_LEASE_MS, testOrgId),
    ]);
    const idsA = workerA.map((event) => event.id);
    const idsB = workerB.map((event) => event.id);

    expect(idsA.length).toBeGreaterThan(0);
    expect(idsB.length).toBeGreaterThan(0);
    expect(idsA.filter((id) => idsB.includes(id))).toEqual([]);
    expect([...idsA, ...idsB].sort()).toEqual(events.map((event) => event.id).sort());
    expect(workerA.every((event) => event.claimToken === "test-worker-a")).toBe(true);
    expect(workerB.every((event) => event.claimToken === "test-worker-b")).toBe(true);

    for (const event of workerA) expect(await acknowledgeOutboxEvent(event.id, "test-worker-a", now)).toBe(true);
    for (const event of workerB) expect(await acknowledgeOutboxEvent(event.id, "test-worker-b", now)).toBe(true);
  });

  it("recovers a crashed worker lease and rejects its stale acknowledgement", async () => {
    const event = await createEvent(`crash-recovery-${randomUUID().slice(0, 8)}`);
    const claimedAt = new Date();
    const workerA = await claimOutboxBatch("crashed-worker", claimedAt, 1, 100, testOrgId);
    expect(workerA.map((row) => row.id)).toContain(event.id);

    const beforeExpiry = await claimOutboxBatch(
      "recovery-worker",
      new Date(claimedAt.getTime() + 99),
      1,
      OUTBOX_LEASE_MS,
      testOrgId
    );
    expect(beforeExpiry.map((row) => row.id)).not.toContain(event.id);

    // Model worker A crashing after it may have emitted, but before its DB ack.
    const recovered = await claimOutboxBatch(
      "recovery-worker",
      new Date(claimedAt.getTime() + 101),
      1,
      OUTBOX_LEASE_MS,
      testOrgId
    );
    const recoveredEvent = recovered.find((row) => row.id === event.id);
    expect(recoveredEvent).toBeTruthy();
    expect(recoveredEvent?.claimToken).toBe("recovery-worker");
    expect(await acknowledgeOutboxEvent(event.id, "crashed-worker")).toBe(false);
    expect(await acknowledgeOutboxEvent(event.id, "recovery-worker")).toBe(true);

    const persisted = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(persisted.status).toBe("PUBLISHED");
    expect(persisted.claimToken).toBeNull();
    expect(persisted.claimedUntil).toBeNull();
  });

  it("releases failed work with backoff and fences acknowledgements after release", async () => {
    const event = await createEvent(`retry-${randomUUID().slice(0, 8)}`);
    const now = new Date();
    const [claimed] = await claimOutboxBatch("retry-worker", now, 1, OUTBOX_LEASE_MS, testOrgId);
    expect(claimed?.id).toBe(event.id);
    expect(await releaseOutboxEvent(claimed!, "retry-worker", new Error("transient publish failure"), now)).toBe(true);
    expect(await acknowledgeOutboxEvent(event.id, "retry-worker", now)).toBe(false);

    const persisted = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(persisted.status).toBe("PENDING");
    expect(persisted.attempts).toBe(1);
    expect(persisted.availableAt.getTime()).toBeGreaterThan(now.getTime());
    expect(persisted.lastError).toBe("transient publish failure");
  });
});
