import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { writeAudit } from "../../services/audit";
import { ingestReading } from "../telemetry/telemetry.service";
import type { SimulationScenario } from "@frostguard/shared";

const timers = new Map<string, NodeJS.Timeout>();

type SimulationState = {
  sensorId: string;
  scenario: SimulationScenario;
  intervalMs: number;
  step: number;
  sequenceNumber: number;
  baseTemp: number;
};

const state = new Map<string, SimulationState>();

function scenarioTemperature(s: SimulationState, scenario: SimulationScenario): number | null {
  s.step += 1;
  switch (scenario) {
    case "STABLE":
      return s.baseTemp + Math.sin(s.step / 6) * 0.25;
    case "DRIFT":
      return s.baseTemp + Math.min(6, s.step * 0.18);
    case "EXCURSION":
      return s.baseTemp + 4.2 + Math.sin(s.step / 4) * 0.6;
    case "RECOVERY":
      return s.baseTemp + Math.max(0, 4.2 - s.step * 0.35);
    case "MALFUNCTION":
      return s.baseTemp + (s.step % 3 === 0 ? 12 : 0);
    case "DISCONNECT":
      return null;
    default:
      return s.baseTemp;
  }
}

export async function startSimulation(
  orgId: string,
  actorId: string,
  sensorId: string,
  scenario: SimulationScenario,
  intervalMs: number,
  requestId?: string
) {
  const sensor = await prisma.sensor.findFirst({
    where: { id: sensorId, orgId },
    include: { readings: { orderBy: { sequenceNumber: "desc" }, take: 1 } },
  });
  if (!sensor) throw AppError.notFound("Device not found");
  if (sensor.status === "REVOKED") throw AppError.badRequest("Cannot simulate a revoked device");

  stopTimer(sensorId);
  await prisma.deviceSimulation.updateMany({
    where: { sensorId, status: "RUNNING" },
    data: { status: "STOPPED", stoppedAt: new Date() },
  });

  const simulation = await prisma.deviceSimulation.create({
    data: { orgId, sensorId, scenario, intervalMs, status: "RUNNING", createdById: actorId },
  });

  const baseTemp = sensor.readings[0] ? Number(sensor.readings[0].temperature) : 5;
  const s: SimulationState = {
    sensorId,
    scenario,
    intervalMs,
    step: 0,
    sequenceNumber: (sensor.readings[0]?.sequenceNumber ?? 0) + 1,
    baseTemp: Math.max(-70, Math.min(25, baseTemp)),
  };
  state.set(sensorId, s);

  const timer = setInterval(() => {
    void tick(orgId, s);
  }, intervalMs);
  timers.set(sensorId, timer);

  await writeAudit(prisma, {
    orgId,
    actorId,
    action: "simulation.started",
    entityType: "sensor",
    entityId: sensorId,
    metadata: { scenario, intervalMs },
    requestId,
  });

  return simulation;
}

async function tick(orgId: string, s: SimulationState) {
  const temp = scenarioTemperature(s, s.scenario);
  if (temp !== null) {
    try {
      await ingestReading(
        {
          deviceId: (await prisma.sensor.findUnique({ where: { id: s.sensorId }, select: { deviceId: true } }))!.deviceId,
          temperature: Number(temp.toFixed(2)),
          humidity: 48 + Math.sin(s.step / 9) * 3,
          recordedAt: new Date().toISOString(),
          sequenceNumber: s.sequenceNumber++,
          isSimulated: true,
        },
        { internal: true }
      );
      await prisma.deviceSimulation.updateMany({
        where: { sensorId: s.sensorId, status: "RUNNING" },
        data: { lastTickAt: new Date() },
      });
    } catch {
      // A single failed tick must not kill the simulator loop; the next tick retries.
    }
  } else {
    await prisma.deviceSimulation.updateMany({
      where: { sensorId: s.sensorId, status: "RUNNING" },
      data: { lastTickAt: new Date() },
    });
  }
  void orgId;
}

function stopTimer(sensorId: string) {
  const existing = timers.get(sensorId);
  if (existing) clearInterval(existing);
  timers.delete(sensorId);
  state.delete(sensorId);
}

export async function stopSimulation(orgId: string, actorId: string, sensorId: string, requestId?: string) {
  const sensor = await prisma.sensor.findFirst({ where: { id: sensorId, orgId } });
  if (!sensor) throw AppError.notFound("Device not found");
  stopTimer(sensorId);
  const updated = await prisma.deviceSimulation.updateMany({
    where: { sensorId, status: "RUNNING" },
    data: { status: "STOPPED", stoppedAt: new Date() },
  });
  await writeAudit(
    prisma,
    { orgId, actorId, action: "simulation.stopped", entityType: "sensor", entityId: sensorId, requestId }
  );
  return { stopped: updated.count };
}

export async function listSimulations(orgId: string) {
  return prisma.deviceSimulation.findMany({
    where: { orgId },
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { sensor: { select: { id: true, deviceId: true, name: true } } },
  });
}

export async function resetSimulation(orgId: string, actorId: string, sensorId: string, requestId?: string) {
  const sensor = await prisma.sensor.findFirst({ where: { id: sensorId, orgId } });
  if (!sensor) throw AppError.notFound("Device not found");
  stopTimer(sensorId);
  await prisma.deviceSimulation.updateMany({
    where: { sensorId, status: "RUNNING" },
    data: { status: "STOPPED", stoppedAt: new Date() },
  });
  await writeAudit(
    prisma,
    { orgId, actorId, action: "simulation.reset", entityType: "sensor", entityId: sensorId, requestId }
  );
  return { reset: true };
}

/** Clear in-process timers on shutdown. */
export function stopAllSimulations() {
  for (const timer of timers.values()) clearInterval(timer);
  timers.clear();
  state.clear();
}
