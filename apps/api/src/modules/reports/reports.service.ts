import { stringify } from "csv-stringify/sync";
import PDFDocument from "pdfkit";
import type { Response } from "express";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { getOverview } from "../dashboard/dashboard.service";

const DAY = 86_400_000;

/** Prefix spreadsheet formula-like text before CSV serialization. Numeric values stay numeric. */
export function sanitizeSpreadsheetCell(value: string): string {
  let index = 0;
  while (index < value.length && (value.charCodeAt(index) <= 0x20 || value.charCodeAt(index) === 0xfeff)) index += 1;
  return "=+-@".includes(value[index] ?? "\0") ? `'${value}` : value;
}

export function sanitizeDownloadFilename(value: string): string {
  const basename = value.split(/[\\/]/).pop() ?? "";
  const filename = basename.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 120);
  return filename || "frostguard-report.csv";
}

function csv(res: Response, filename: string, rows: Record<string, unknown>[]) {
  const safeRows = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === "string" ? sanitizeSpreadsheetCell(value) : value,
      ])
    )
  );
  const body = stringify(safeRows, { header: true });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${sanitizeDownloadFilename(filename)}"`);
  res.send(body);
}

export async function temperatureReport(
  res: Response,
  orgId: string,
  params: { sensorId?: string; from: Date; to: Date; simulated?: boolean }
) {
  if (params.to.getTime() - params.from.getTime() > 90 * DAY) throw AppError.badRequest("Report range cannot exceed 90 days");
  const readings = await prisma.sensorReading.findMany({
    where: {
      orgId,
      ...(params.sensorId ? { sensorId: params.sensorId } : {}),
      recordedAt: { gte: params.from, lte: params.to },
      ...(params.simulated !== undefined ? { isSimulated: params.simulated } : {}),
    },
    include: { sensor: { select: { deviceId: true, name: true } } },
    orderBy: { recordedAt: "asc" },
    take: 50_000,
  });
  return csv(
    res,
    `frostguard-temperature-${params.from.toISOString().slice(0, 10)}.csv`,
    readings.map((r) => ({
      reading_id: r.id.toString(),
      device_id: r.sensor.deviceId,
      sensor_name: r.sensor.name,
      temperature_c: Number(r.temperature),
      humidity_pct: r.humidity != null ? Number(r.humidity) : "",
      recorded_at_utc: r.recordedAt.toISOString(),
      received_at_utc: r.receivedAt.toISOString(),
      sequence_number: r.sequenceNumber,
      simulated: r.isSimulated,
    }))
  );
}

export async function shipmentReport(res: Response, orgId: string, from: Date, to: Date) {
  const shipments = await prisma.shipment.findMany({
    where: { orgId, createdAt: { gte: from, lte: to } },
    include: {
      originWarehouse: { select: { name: true } },
      vehicle: { select: { plateNumber: true } },
      driver: { select: { fullName: true } },
      _count: { select: { items: true, excursions: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return csv(
    res,
    `frostguard-shipments-${from.toISOString().slice(0, 10)}.csv`,
    shipments.map((s) => ({
      code: s.code,
      status: s.status,
      origin: s.originWarehouse.name,
      destination: s.destinationName,
      vehicle: s.vehicle?.plateNumber ?? "",
      driver: s.driver?.fullName ?? "",
      items: s._count.items,
      excursions: s._count.excursions,
      risk_score: s.riskScore,
      dispatched_at_utc: s.dispatchedAt?.toISOString() ?? "",
      delivered_at_utc: s.deliveredAt?.toISOString() ?? "",
      estimated_arrival_utc: s.estimatedArrivalAt?.toISOString() ?? "",
    }))
  );
}

export async function incidentReport(res: Response, orgId: string, from: Date, to: Date) {
  const incidents = await prisma.incident.findMany({
    where: { orgId, openedAt: { gte: from, lte: to } },
    include: { assignee: { select: { fullName: true } }, actions: { orderBy: { createdAt: "asc" } } },
    orderBy: { openedAt: "asc" },
  });
  return csv(
    res,
    `frostguard-incidents-${from.toISOString().slice(0, 10)}.csv`,
    incidents.map((i) => ({
      code: i.code,
      title: i.title,
      severity: i.severity,
      status: i.status,
      assignee: i.assignee?.fullName ?? "",
      risk_score: i.riskScore,
      opened_at_utc: i.openedAt.toISOString(),
      acknowledged_at_utc: i.acknowledgedAt?.toISOString() ?? "",
      resolved_at_utc: i.resolvedAt?.toISOString() ?? "",
      outcome: i.outcome ?? "",
      resolution_notes: i.resolutionNotes ?? "",
      action_count: i.actions.length,
    }))
  );
}

export async function batchTraceabilityReport(res: Response, orgId: string, batchId: string) {
  const batch = await prisma.batch.findFirst({
    where: { id: batchId, orgId },
    include: {
      product: true,
      supplier: true,
      storageUnit: { include: { warehouse: true } },
      shipmentItems: {
        include: {
          shipment: {
            include: { events: { orderBy: { occurredAt: "asc" } }, excursions: true },
          },
        },
      },
    },
  });
  if (!batch) throw AppError.notFound("Batch not found");

  const rows: Record<string, unknown>[] = [
    {
      event_type: "BATCH_REGISTERED",
      occurred_at_utc: batch.createdAt.toISOString(),
      detail: `${batch.batchNumber} · ${batch.product.name} · ${batch.quantity} units`,
      location: batch.storageUnit?.name ?? "",
      temperature: "",
      reference: batch.id,
    },
  ];
  for (const item of batch.shipmentItems) {
    rows.push({
      event_type: "SHIPMENT",
      occurred_at_utc: (item.shipment.dispatchedAt ?? item.shipment.createdAt).toISOString(),
      detail: `${item.shipment.code} · ${item.quantity} units · ${item.shipment.status}`,
      location: item.shipment.destinationName,
      temperature: "",
      reference: item.shipment.code,
    });
    for (const e of item.shipment.events) {
      rows.push({
        event_type: e.type,
        occurred_at_utc: e.occurredAt.toISOString(),
        detail: e.message,
        location: e.lat != null ? `${e.lat}, ${e.lng}` : "",
        temperature: "",
        reference: item.shipment.code,
      });
    }
    for (const ex of item.shipment.excursions) {
      rows.push({
        event_type: "EXCURSION",
        occurred_at_utc: ex.startedAt.toISOString(),
        detail: `${ex.severity} · ${ex.minTemp}–${ex.maxTemp} °C · ${ex.readingsCount} readings`,
        location: "",
        temperature: Number(ex.maxTemp),
        reference: ex.id,
      });
    }
  }
  return csv(res, `frostguard-batch-${batch.batchNumber}.csv`, rows);
}

export async function summaryPdf(res: Response, orgId: string) {
  const [overview, org] = await Promise.all([
    getOverview(orgId),
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
  ]);
  const orgName = org?.name ?? "Organization";
  const incidents = await prisma.incident.findMany({
    where: { orgId, status: { in: ["OPEN", "ACKNOWLEDGED", "INVESTIGATING"] } },
    orderBy: { openedAt: "desc" },
    take: 12,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="frostguard-operations-summary.pdf"');

  const doc = new PDFDocument({ size: "A4", margin: 48 });
  doc.pipe(res);
  doc.fontSize(22).fillColor("#0f172a").text("FROSTGUARD", { continued: true });
  doc.fontSize(11).fillColor("#64748b").text("  Every Degree Matters.");
  doc.moveDown(0.4);
  doc.fontSize(15).fillColor("#0f172a").text("Operations Summary");
  doc.fontSize(9).fillColor("#64748b").text(`${orgName} · generated ${new Date().toISOString()}`);
  doc.moveDown(1);

  doc.fontSize(12).fillColor("#0f172a").text("Key indicators");
  doc.moveDown(0.4);
  const k = overview.kpis;
  const lines = [
    `Active shipments: ${k.activeShipments}`,
    `Safe shipments: ${k.safeShipments}`,
    `Active temperature excursions: ${k.activeExcursions}`,
    `Critical incidents open: ${k.criticalIncidents}`,
    `Connected devices: ${k.connectedDevices} · offline: ${k.offlineDevices}`,
    `Batches at risk: ${k.atRiskBatches}`,
    `On-time deliveries (30d): ${k.onTimeDeliveries}/${k.deliveredShipments30d}${
      k.onTimeRate != null ? ` (${k.onTimeRate}%)` : " (no ETA baseline)"
    }`,
  ];
  for (const line of lines) doc.fontSize(10).fillColor("#334155").text(`• ${line}`);
  doc.moveDown(1);

  doc.fontSize(12).fillColor("#0f172a").text("Open incidents");
  doc.moveDown(0.4);
  if (incidents.length === 0) {
    doc.fontSize(10).fillColor("#64748b").text("No open incidents.");
  } else {
    for (const i of incidents) {
      doc.fontSize(10).fillColor("#334155").text(`${i.code} · ${i.severity} · ${i.status} — ${i.title}`);
      doc.fontSize(8).fillColor("#94a3b8").text(`Opened ${i.openedAt.toISOString()} · risk score ${i.riskScore}`);
    }
  }
  doc.moveDown(1.2);
  doc.fontSize(8).fillColor("#94a3b8").text(
    "Generated from live database records. Risk scores are transparent rule-based indicators, not medical or regulatory safety determinations."
  );
  doc.end();
}
