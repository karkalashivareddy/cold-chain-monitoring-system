import type { Prisma } from "@prisma/client";

export type ResolvedProfile = {
  minTemp: number;
  maxTemp: number;
  criticalMin: number;
  criticalMax: number;
  persistenceReadings: number;
  source: string;
  profileId?: string | null;
};

type SensorTarget = {
  storageUnitId: string | null;
  shipmentId: string | null;
};

/**
 * Resolve the applicable temperature envelope for a sensor's current target.
 * Shipment profiles are intersected (narrowest envelope wins) so a mixed load
 * never inherits a permissive limit from a single batch.
 */
export async function resolveProfile(
  tx: Prisma.TransactionClient,
  params: { orgId: string; target: SensorTarget }
): Promise<ResolvedProfile | null> {
  const { orgId, target } = params;

  if (target.shipmentId) {
    const items = await tx.shipmentItem.findMany({
      where: { shipmentId: target.shipmentId },
      include: {
        batch: {
          include: {
            temperatureProfile: true,
            product: { include: { temperatureProfile: true } },
          },
        },
      },
    });
    const profiles = items
      .map((i) => i.batch.temperatureProfile ?? i.batch.product.temperatureProfile)
      .filter((p): p is NonNullable<typeof p> => Boolean(p));

    if (profiles.length > 0) {
      return {
        minTemp: Math.max(...profiles.map((p) => Number(p.minTemp))),
        maxTemp: Math.min(...profiles.map((p) => Number(p.maxTemp))),
        criticalMin: Math.min(...profiles.map((p) => Number(p.criticalMinTemp ?? Number(p.minTemp) - 3))),
        criticalMax: Math.max(...profiles.map((p) => Number(p.criticalMaxTemp ?? Number(p.maxTemp) + 3))),
        persistenceReadings: Math.max(...profiles.map((p) => p.persistenceReadings)),
        source: "SHIPMENT_PROFILE",
      };
    }
    // Fall back to product limits carried by the shipment batches.
    const products = items.map((i) => i.batch.product);
    if (products.length > 0) {
      return {
        minTemp: Math.max(...products.map((p) => Number(p.minTemp))),
        maxTemp: Math.min(...products.map((p) => Number(p.maxTemp))),
        criticalMin: Math.min(...products.map((p) => Number(p.minTemp) - 3)),
        criticalMax: Math.max(...products.map((p) => Number(p.maxTemp) + 3)),
        persistenceReadings: 2,
        source: "PRODUCT_LIMITS",
      };
    }
  }

  if (target.storageUnitId) {
    const batches = await tx.batch.findMany({
      where: { storageUnitId: target.storageUnitId, orgId, remainingQuantity: { gt: 0 } },
      include: { temperatureProfile: true, product: true },
      take: 50,
    });
    const profiles = batches
      .map((b) => b.temperatureProfile)
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
    if (profiles.length > 0) {
      return {
        minTemp: Math.max(...profiles.map((p) => Number(p.minTemp))),
        maxTemp: Math.min(...profiles.map((p) => Number(p.maxTemp))),
        criticalMin: Math.min(...profiles.map((p) => Number(p.criticalMinTemp ?? Number(p.minTemp) - 3))),
        criticalMax: Math.max(...profiles.map((p) => Number(p.criticalMaxTemp ?? Number(p.maxTemp) + 3))),
        persistenceReadings: Math.max(...profiles.map((p) => p.persistenceReadings)),
        source: "STORAGE_PROFILE",
      };
    }
    const unit = await tx.storageUnit.findUnique({ where: { id: target.storageUnitId } });
    if (unit) {
      return {
        minTemp: Number(unit.minTemp),
        maxTemp: Number(unit.maxTemp),
        criticalMin: Number(unit.minTemp) - 3,
        criticalMax: Number(unit.maxTemp) + 3,
        persistenceReadings: 2,
        source: "STORAGE_UNIT_LIMITS",
      };
    }
  }

  return null;
}

export type Evaluation = {
  state: "NORMAL" | "WARNING" | "CRITICAL";
  isOutOfRange: boolean;
  isCritical: boolean;
  deviation: number;
  profile: ResolvedProfile | null;
};

export function evaluateTemperature(temp: number, profile: ResolvedProfile | null): Evaluation {
  if (!profile) {
    return { state: "NORMAL", isOutOfRange: false, isCritical: false, deviation: 0, profile: null };
  }
  const highDev = temp - profile.maxTemp;
  const lowDev = profile.minTemp - temp;
  const deviation = Math.max(highDev, lowDev, 0);
  const isCritical = temp > profile.criticalMax || temp < profile.criticalMin;
  const isOutOfRange = temp > profile.maxTemp || temp < profile.minTemp;

  return {
    state: isCritical ? "CRITICAL" : isOutOfRange ? "WARNING" : "NORMAL",
    isOutOfRange,
    isCritical,
    deviation: Math.round(deviation * 100) / 100,
    profile,
  };
}

/** Transparent, rule-based risk score. Never presented as a medical assessment. */
export function calculateRiskScore(input: {
  severity: "WARNING" | "CRITICAL";
  deviation: number;
  durationMinutes: number;
  repeatedExcursions: number;
  missingTelemetry: boolean;
}): number {
  let score = input.severity === "CRITICAL" ? 45 : 22;
  score += Math.min(25, Math.round(input.deviation * 6));
  score += Math.min(20, Math.round(input.durationMinutes * 0.5));
  score += Math.min(10, input.repeatedExcursions * 3);
  if (input.missingTelemetry) score += 10;
  return Math.max(0, Math.min(100, score));
}

export function classifyRisk(score: number): "LOW" | "MEDIUM" | "HIGH" | "SEVERE" {
  if (score >= 75) return "SEVERE";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}
