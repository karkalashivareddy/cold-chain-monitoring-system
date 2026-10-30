import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, FlaskConical, Pencil, Snowflake } from "lucide-react";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { daysUntil, fmtDate, fmtDateTime, fmtDuration, fmtNumber, fmtTemp, humanize, severityTone, statusTone, toNumber } from "@/lib/format";
import type { Traceability } from "@/lib/types";
import { TemperatureTrendChart } from "@/components/Charts";
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
  SimulatedBadge,
  TD,
  TH,
  TR,
  TableWrap,
} from "@/components/ui";
import { BatchDialog } from "./Batches";

export default function BatchDetailPage() {
  const { id = "" } = useParams();
  const { hasPermission } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const query = useQuery({
    queryKey: ["batches", id, "traceability"],
    queryFn: () => api.get<Traceability>(`/batches/${id}/traceability`),
    enabled: Boolean(id),
  });

  if (query.isLoading) return <PageSkeleton />;
  if (query.isError || !query.data) {
    return (
      <div className="space-y-4">
        <Link to="/app/batches" className="inline-flex items-center gap-1 text-xs text-mist hover:text-ice">
          <ArrowLeft className="size-3.5" aria-hidden /> Back to batches
        </Link>
        <ErrorState message={apiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const { batch, timeline, excursions, readings } = query.data;
  const days = daysUntil(batch.expiresAt);
  const simulated = readings.filter((reading) => reading.isSimulated).length;

  async function downloadReport() {
    setDownloading(true);
    try {
      await api.download(`/reports/batch/${batch.id}`, `frostguard-batch-${batch.batchNumber}.pdf`);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Link to="/app/batches" className="inline-flex items-center gap-1 text-xs text-mist hover:text-ice">
          <ArrowLeft className="size-3.5" aria-hidden /> Back to batches
        </Link>
        <PageHeader
          className="mt-3"
          eyebrow="Traceability record"
          title={batch.batchNumber}
          description={`${batch.product.name} · ${batch.product.code} · ${batch.product.category}`}
          actions={
            <>
              <Badge tone={statusTone(batch.status)} dot>{humanize(batch.status)}</Badge>
              {hasPermission("report:read") ? (
                <Button variant="secondary" size="sm" loading={downloading} onClick={() => void downloadReport()}>
                  <Download className="size-3.5" aria-hidden /> Report
                </Button>
              ) : null}
              {hasPermission("batch:write") ? (
                <Button size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="size-3.5" aria-hidden /> Edit batch
                </Button>
              ) : null}
            </>
          }
        />
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Remaining stock" value={`${fmtNumber(batch.remainingQuantity)} units`} hint={`of ${fmtNumber(batch.quantity)} registered`} tone="info" />
        <Kpi
          label="Expiry"
          value={fmtDate(batch.expiresAt)}
          hint={days === null ? "—" : days < 0 ? `${Math.abs(days)} days overdue` : `${days} days remaining`}
          tone={days !== null && days < 30 ? "danger" : "success"}
          icon={<FlaskConical className="size-4" aria-hidden />}
        />
        <Kpi
          label="Storage location"
          value={batch.storageUnit?.name ?? "Unassigned"}
          hint={batch.storageUnit?.warehouse?.name ?? "No warehouse assigned"}
          tone="neutral"
          icon={<Snowflake className="size-4" aria-hidden />}
        />
        <Kpi
          label="Envelope"
          value={`${fmtTemp(batch.product.minTemp)} – ${fmtTemp(batch.product.maxTemp)}`}
          hint={batch.temperatureProfile?.name ?? "Inherited from product"}
          tone="violet"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Temperature history"
            description="Readings from sensors assigned to the storage unit and associated shipments."
            action={simulated > 0 ? <SimulatedBadge /> : <Badge tone="success" dot>All recorded</Badge>}
          />
          <TemperatureTrendChart
            height={280}
            data={readings.map((reading) => ({
              bucketStart: reading.recordedAt,
              avg: toNumber(reading.temperature) ?? 0,
            }))}
          />
          <p className="mt-3 border-t border-line/40 pt-3 text-[10px] text-mist">
            {readings.length} readings · {simulated} explicitly simulated
            {simulated > 0 ? " (seed or simulator, never presented as physical sensor truth)" : ""}.
          </p>
        </Panel>

        <Panel>
          <PanelHeader title="Genealogy timeline" description="Registration, storage, movement and excursions." />
          {timeline.length === 0 ? (
            <EmptyState title="No events yet" description="Timeline entries appear as the batch moves." />
          ) : (
            <ol className="relative space-y-4 border-l border-line/70 pl-5">
              {timeline.map((event, index) => (
                <li key={`${event.at}-${index}`} className="relative">
                  <span className="absolute -left-[1.42rem] top-1 size-2 rounded-full bg-cyan ring-4 ring-abyss" aria-hidden />
                  <p className="text-[10px] uppercase tracking-wider text-mist">{fmtDateTime(event.at)}</p>
                  <p className="mt-0.5 text-xs font-medium text-ice">{event.title}</p>
                  <p className="mt-0.5 text-[11px] text-mist">{event.detail}</p>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader title="Excursions touching this batch" description="Direct batch excursions plus those on its shipments." />
          {excursions.length === 0 ? (
            <EmptyState title="No excursions" description="This batch has stayed within profile." />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <TH>Severity</TH>
                  <TH>Window</TH>
                  <TH>Observed</TH>
                  <TH>Thresholds</TH>
                  <TH>Duration</TH>
                  <TH>Incident</TH>
                </tr>
              </thead>
              <tbody>
                {excursions.map((excursion) => (
                  <TR key={excursion.id}>
                    <TD><Badge tone={severityTone(excursion.severity)} dot>{excursion.severity}</Badge></TD>
                    <TD className="whitespace-nowrap text-xs">{fmtDateTime(excursion.startedAt)}{excursion.endedAt ? ` → ${fmtDateTime(excursion.endedAt)}` : " · ongoing"}</TD>
                    <TD className="stat-value whitespace-nowrap">{fmtTemp(excursion.minTemp)} – {fmtTemp(excursion.maxTemp)}</TD>
                    <TD className="stat-value whitespace-nowrap text-mist">{fmtTemp(excursion.thresholdMin)} – {fmtTemp(excursion.thresholdMax)}</TD>
                    <TD>{fmtDuration(excursion.durationSeconds)}</TD>
                    <TD>{excursion.incident ? <Link to={`/app/incidents/${excursion.incident.id}`} className="text-xs text-cyan hover:underline">{excursion.incident.code}</Link> : "—"}</TD>
                  </TR>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Shipment movements" description="Where this batch has travelled." />
            {batch.shipmentItems.length === 0 ? (
              <p className="text-xs text-mist">No shipment has carried this batch yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {batch.shipmentItems.map((item) => (
                  <li key={item.id} className="rounded-xl border border-line/60 bg-abyss/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Link to={`/app/shipments/${item.shipment.id}`} className="font-mono text-xs text-cyan hover:underline">{item.shipment.code}</Link>
                      <Badge tone={statusTone(item.shipment.status)}>{humanize(item.shipment.status)}</Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-mist">{item.quantity} units → {item.shipment.destinationName}</p>
                    <p className="text-[10px] text-mist/70">{item.shipment.deliveredAt ? `Delivered ${fmtDateTime(item.shipment.deliveredAt)}` : item.shipment.dispatchedAt ? `Dispatched ${fmtDateTime(item.shipment.dispatchedAt)}` : "Awaiting dispatch"}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Product record" description="Source and handling profile." />
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-3"><dt className="text-mist">Manufacturer</dt><dd className="text-right text-ice">{batch.product.manufacturer ?? "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-mist">Supplier</dt><dd className="text-right text-ice">{batch.supplier?.name ?? "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-mist">Profile</dt><dd className="text-right text-ice">{batch.temperatureProfile?.name ?? "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-mist">Manufactured</dt><dd className="text-right text-ice">{fmtDate(batch.manufacturedAt)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-mist">Registered</dt><dd className="text-right text-ice">{fmtDate(batch.createdAt)}</dd></div>
            </dl>
            {batch.product.description ? <p className="mt-3 border-t border-line/40 pt-3 text-[11px] leading-relaxed text-mist">{batch.product.description}</p> : null}
          </Panel>
        </div>
      </section>

      <BatchDialog open={editOpen} batch={batch} onClose={() => setEditOpen(false)} />
    </div>
  );
}
