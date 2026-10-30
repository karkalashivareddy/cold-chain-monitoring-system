import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, Gauge, PackageX, Radio, ShieldAlert, Truck } from "lucide-react";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { daysUntil, fmtDate, fmtDateTime, fmtNumber, fmtPercent, fmtRelative, fmtTemp, humanize, riskBandTone, riskTone, statusTone } from "@/lib/format";
import type { AnalyticsData } from "@/lib/types";
import { DeliveryChart, WarehouseBars } from "@/components/Charts";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Kpi,
  PageHeader,
  PageSkeleton,
  Panel,
  PanelHeader,
  ProgressBar,
  TD,
  TH,
  TR,
  TableWrap,
  Tabs,
} from "@/components/ui";

const BANDS = ["SEVERE", "HIGH", "MEDIUM", "LOW"] as const;

export default function AnalyticsPage() {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState("risk");
  const [downloading, setDownloading] = useState<string | null>(null);

  const query = useQuery({ queryKey: ["analytics"], queryFn: () => api.get<AnalyticsData>("/analytics") });
  const canReport = hasPermission("report:read");

  async function download(path: string, filename: string, key: string) {
    setDownloading(key);
    try {
      await api.download(path, filename);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setDownloading(null);
    }
  }

  if (query.isLoading) return <PageSkeleton />;
  if (query.isError || !query.data) {
    return <ErrorState message={apiErrorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const data = query.data;
  const activeShipments = data.risk.shipments.length;
  const severe = data.risk.buckets.SEVERE ?? 0;
  const high = data.risk.buckets.HIGH ?? 0;
  const openRisk = data.risk.shipments.filter((shipment) => shipment.riskBand !== "LOW").length;
  const expiringSoon = data.expiring.filter((batch) => {
    const days = daysUntil(batch.expiresAt);
    return days !== null && days <= 30;
  }).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Intelligence"
        title="Analytics"
        description="Server-computed risk, warehouse performance, device reliability and delivery outcomes. No client-side metric is invented."
        actions={
          canReport ? (
            <>
              <Button variant="secondary" size="sm" loading={downloading === "pdf"} onClick={() => void download("/reports/summary.pdf", "frostguard-operations-summary.pdf", "pdf")}>
                <Download className="size-3.5" aria-hidden /> Operations PDF
              </Button>
              <Button variant="secondary" size="sm" loading={downloading === "shipments"} onClick={() => void download(`/reports/shipments?from=${new Date(Date.now() - 30 * 86_400_000).toISOString()}&to=${new Date().toISOString()}`, "frostguard-shipments.csv", "shipments")}>
                <Download className="size-3.5" aria-hidden /> Shipments CSV
              </Button>
              <Button variant="secondary" size="sm" loading={downloading === "incidents"} onClick={() => void download(`/reports/incidents?from=${new Date(Date.now() - 30 * 86_400_000).toISOString()}&to=${new Date().toISOString()}`, "frostguard-incidents.csv", "incidents")}>
                <Download className="size-3.5" aria-hidden /> Incidents CSV
              </Button>
            </>
          ) : null
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Shipments in scope" value={fmtNumber(activeShipments)} hint="Planned through delayed" tone="info" icon={<Truck className="size-4" aria-hidden />} />
        <Kpi label="Elevated risk" value={fmtNumber(openRisk)} hint={`${severe} severe · ${high} high`} tone={severe ? "danger" : high ? "warning" : "success"} icon={<ShieldAlert className="size-4" aria-hidden />} />
        <Kpi label="Expiring ≤30 days" value={fmtNumber(expiringSoon)} hint="Available, reserved or quarantined" tone={expiringSoon ? "warning" : "success"} icon={<PackageX className="size-4" aria-hidden />} />
        <Kpi label="Devices tracked" value={fmtNumber(data.devices.length)} hint="7-day reliability window" tone="violet" icon={<Radio className="size-4" aria-hidden />} />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "risk", label: "Shipment risk", count: activeShipments },
            { value: "warehouses", label: "Warehouses", count: data.warehouses.length },
            { value: "devices", label: "Devices", count: data.devices.length },
            { value: "expiry", label: "Expiry", count: data.expiring.length },
          ]}
        />
        <Badge tone="neutral">Server-computed · {fmtDateTime(new Date().toISOString())}</Badge>
      </div>

      {tab === "risk" ? (
        <section className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
          <Panel>
            <PanelHeader title="Risk-ranked shipments" description="Ordered by the server's live risk score with explicit contributing reasons." />
            {data.risk.shipments.length === 0 ? (
              <EmptyState title="No active shipments" description="Risk scoring applies to planned, dispatched, in-transit and delayed shipments." />
            ) : (
              <TableWrap>
                <thead><tr><TH>Shipment</TH><TH>Status</TH><TH>Risk</TH><TH>Reasons</TH><TH>Temp</TH></tr></thead>
                <tbody>
                  {data.risk.shipments.map((shipment) => (
                    <TR key={shipment.id}>
                      <TD>
                        <Link to={`/app/shipments/${shipment.id}`} className="font-mono text-[11px] text-cyan hover:underline">{shipment.code}</Link>
                        <p className="mt-0.5 text-[11px] text-ice">{shipment.destinationName}</p>
                        <ProgressBar value={shipment.progressPercent} tone="info" label={`${shipment.code} progress`} className="mt-1.5 max-w-[9rem]" />
                      </TD>
                      <TD><Badge tone={statusTone(shipment.status)} dot>{humanize(shipment.status)}</Badge></TD>
                      <TD className="min-w-[7rem]">
                        <div className="flex items-center gap-2">
                          <span className="stat-value text-sm text-ice">{shipment.riskScore}</span>
                          <Badge tone={riskBandTone(shipment.riskBand)}>{shipment.riskBand}</Badge>
                        </div>
                        <ProgressBar value={shipment.riskScore} tone={riskTone(shipment.riskScore)} label={`${shipment.code} risk`} className="mt-1.5" />
                      </TD>
                      <TD className="max-w-[18rem]">
                        <ul className="space-y-0.5 text-[10px] text-mist">
                          {shipment.reasons.map((reason) => <li key={reason} className="flex gap-1"><span className="text-cyan" aria-hidden>·</span>{reason}</li>)}
                        </ul>
                      </TD>
                      <TD>
                        <p className="stat-value text-xs text-ice">{shipment.temperature != null ? fmtTemp(shipment.temperature) : "No data"}</p>
                        <p className="text-[10px] text-mist">{shipment.lastReadingAt ? fmtRelative(shipment.lastReadingAt) : "No reading"}</p>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Risk distribution" description="Current active shipment count per server band." />
            <div className="space-y-3">
              {BANDS.map((band) => {
                const count = data.risk.buckets[band] ?? 0;
                const percent = activeShipments ? (count / activeShipments) * 100 : 0;
                return (
                  <div key={band}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-mist"><span className={`size-2 rounded-full ${band === "SEVERE" ? "bg-rose" : band === "HIGH" ? "bg-amber" : band === "MEDIUM" ? "bg-cyan" : "bg-teal"}`} aria-hidden />{humanize(band)}</span>
                      <span className="stat-value text-ice">{count}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className={`h-full rounded-full ${band === "SEVERE" ? "bg-rose" : band === "HIGH" ? "bg-amber" : band === "MEDIUM" ? "bg-cyan" : "bg-teal"}`} style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 rounded-xl border border-line/60 bg-abyss/40 p-3 text-[11px] text-mist">
              <p className="flex items-center gap-1.5 font-medium text-ice"><Gauge className="size-3.5 text-cyan" aria-hidden /> How the score is computed</p>
              <p className="mt-1 leading-relaxed">Open critical excursions raise the floor to 75; warnings to 45; stale telemetry, missing telemetry and exceeded ETAs add further risk. Scores are clamped to 0–100 and classified server-side.</p>
            </div>
          </Panel>
        </section>
      ) : null}

      {tab === "warehouses" ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <Panel>
            <PanelHeader title="Warehouse activity" description="Batches stored and excursions in the last 30 days." />
            <WarehouseBars data={data.warehouses.map((warehouse) => ({ name: warehouse.name, excursions: warehouse.excursions, batches: warehouse.batches }))} height={300} />
          </Panel>
          <Panel>
            <PanelHeader title="Site performance" description="Average temperature is computed from current sensor assignments." />
            <TableWrap>
              <thead><tr><TH>Site</TH><TH>Units</TH><TH>Batches</TH><TH>Excursions</TH><TH>Avg temp</TH></tr></thead>
              <tbody>
                {data.warehouses.map((warehouse) => (
                  <TR key={warehouse.id}>
                    <TD><p className="text-xs text-ice">{warehouse.name}</p><p className="text-[10px] text-mist">{warehouse.city ?? "—"}</p></TD>
                    <TD>{warehouse.units}</TD>
                    <TD>{warehouse.batches}</TD>
                    <TD><Badge tone={warehouse.excursions > 0 ? "warning" : "success"}>{warehouse.excursions}</Badge></TD>
                    <TD className="stat-value">{warehouse.averageTemperature != null ? fmtTemp(warehouse.averageTemperature, 2) : "—"}</TD>
                  </TR>
                ))}
              </tbody>
            </TableWrap>
          </Panel>
        </section>
      ) : null}

      {tab === "devices" ? (
        <Panel>
          <PanelHeader title="Device reliability · 7 days" description="Reliability is observed readings against a one-reading-per-minute reference, capped at 100%." />
          {data.devices.length === 0 ? <EmptyState title="No devices" description="Register a device to start collecting telemetry." /> : (
            <TableWrap>
              <thead><tr><TH>Device</TH><TH>Status</TH><TH>Readings</TH><TH>Excursions</TH><TH>Reliability</TH><TH>Last seen</TH></tr></thead>
              <tbody>
                {data.devices.map((device) => (
                  <TR key={device.id}>
                    <TD><p className="text-xs text-ice">{device.name}</p><p className="font-mono text-[10px] text-cyan">{device.deviceId}</p></TD>
                    <TD><Badge tone={statusTone(device.status)} dot>{humanize(device.status)}</Badge></TD>
                    <TD>{fmtNumber(device.readings)}</TD>
                    <TD><Badge tone={device.excursions ? "warning" : "success"}>{device.excursions}</Badge></TD>
                    <TD className="min-w-[10rem]">
                      <div className="flex items-center gap-2"><span className="stat-value text-xs">{device.reliabilityPercent}%</span><ProgressBar value={device.reliabilityPercent} tone={device.reliabilityPercent >= 70 ? "success" : device.reliabilityPercent >= 30 ? "warning" : "danger"} label={`${device.name} reliability`} /></div>
                    </TD>
                    <TD className="text-xs text-mist">{device.lastSeenAt ? fmtRelative(device.lastSeenAt) : "Never"}</TD>
                  </TR>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Panel>
      ) : null}

      {tab === "expiry" ? (
        <Panel>
          <PanelHeader title="Expiring stock" description="Available, reserved and quarantined batches expiring within 30 days, soonest first." />
          {data.expiring.length === 0 ? <EmptyState title="No expiring stock" description="No batch expires within the warning window." icon={<PackageX className="size-5" aria-hidden />} /> : (
            <TableWrap>
              <thead><tr><TH>Batch</TH><TH>Product</TH><TH>Storage</TH><TH>Remaining</TH><TH>Expires</TH><TH>Status</TH></tr></thead>
              <tbody>
                {data.expiring.map((batch) => {
                  const days = daysUntil(batch.expiresAt);
                  return (
                    <TR key={batch.id}>
                      <TD><Link to={`/app/batches/${batch.id}`} className="font-mono text-[11px] text-cyan hover:underline">{batch.batchNumber}</Link></TD>
                      <TD><p className="text-xs text-ice">{batch.product?.name ?? "—"}</p><p className="text-[10px] text-mist">{batch.product?.code}</p></TD>
                      <TD className="text-xs">{batch.storageUnit?.name ?? "Unassigned"}</TD>
                      <TD>{fmtNumber(batch.remainingQuantity)} / {fmtNumber(batch.quantity)}</TD>
                      <TD>
                        <p className="text-xs text-ice">{fmtDate(batch.expiresAt)}</p>
                        <Badge tone={days !== null && days < 0 ? "danger" : days !== null && days <= 14 ? "warning" : "info"}>{days === null ? "—" : days < 0 ? `${Math.abs(days)}d expired` : `${days}d left`}</Badge>
                      </TD>
                      <TD><Badge tone={statusTone(batch.status)}>{humanize(batch.status)}</Badge></TD>
                    </TR>
                  );
                })}
              </tbody>
            </TableWrap>
          )}
        </Panel>
      ) : null}

      <Panel>
        <PanelHeader title="Delivery performance · 6 months" description="On-time is delivered at or before the estimated arrival. Stacked by month." action={<Badge tone="neutral"><AlertTriangle className="size-3" aria-hidden /> Source: shipments table</Badge>} />
        <DeliveryChart data={data.delivery} height={260} />
        <p className="mt-3 border-t border-line/40 pt-3 text-[10px] text-mist">
          {fmtPercent(data.delivery.reduce((sum, month) => sum + (month.onTimeRate ?? 0), 0) / Math.max(1, data.delivery.filter((month) => month.onTimeRate != null).length))} mean on-time rate across months with deliveries.
        </p>
      </Panel>
    </div>
  );
}
