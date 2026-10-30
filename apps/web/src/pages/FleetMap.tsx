import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, MapPin, Navigation, RefreshCw, ShieldAlert, Snowflake, Truck } from "lucide-react";
import { SHIPMENT_STATUSES } from "@frostguard/shared";
import { api, apiErrorMessage } from "@/lib/api";
import { fmtPercent, fmtTemp, humanize, riskTone, statusTone } from "@/lib/format";
import type { ShipmentMapPoint } from "@/lib/types";
import { FleetMapCanvas } from "@/components/shipments/RouteMap";
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
  Select,
  SimulatedBadge,
} from "@/components/ui";

export default function FleetMapPage() {
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["shipments", "map"],
    queryFn: () => api.get<ShipmentMapPoint[]>("/shipments/map"),
    refetchInterval: 30_000,
  });

  const all = query.data ?? [];
  const visible = useMemo(() => (status ? all.filter((shipment) => shipment.status === status) : all), [all, status]);

  useEffect(() => {
    if (visible.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !visible.some((shipment) => shipment.id === selectedId)) {
      setSelectedId(visible[0]!.id);
    }
  }, [visible, selectedId]);

  const selected = visible.find((shipment) => shipment.id === selectedId) ?? null;
  const critical = visible.reduce((sum, shipment) => sum + shipment.openExcursions.filter((excursion) => excursion.severity === "CRITICAL").length, 0);
  const missingTelemetry = visible.filter((shipment) => shipment.temperature == null).length;
  const simulatedCount = visible.filter((shipment) => shipment.isSimulated).length;
  const averageProgress = visible.length ? Math.round(visible.reduce((sum, shipment) => sum + shipment.progressPercent, 0) / visible.length) : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Command"
        title="Live fleet map"
        description="Every non-cancelled shipment plotted from its committed position. The map refreshes every 30 seconds and on realtime shipment events."
        actions={
          <>
            <Badge tone="neutral"><MapPin className="size-3" aria-hidden /> OpenStreetMap tiles</Badge>
            <Button variant="secondary" size="sm" loading={query.isFetching} onClick={() => void query.refetch()}>
              <RefreshCw className="size-3.5" aria-hidden /> Refresh
            </Button>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Shipments plotted" value={visible.length} hint={status ? `Filtered to ${humanize(status)}` : "All active records"} tone="info" icon={<Truck className="size-4" aria-hidden />} />
        <Kpi label="Avg. progress" value={fmtPercent(averageProgress)} hint="Committed progress values" tone="success" icon={<Navigation className="size-4" aria-hidden />} />
        <Kpi label="Critical open excursions" value={critical} hint="Across plotted shipments" tone={critical ? "danger" : "success"} icon={<ShieldAlert className="size-4" aria-hidden />} />
        <Kpi label="No telemetry" value={missingTelemetry} hint={`${simulatedCount} plotting simulated readings`} tone={missingTelemetry ? "warning" : "success"} icon={<Snowflake className="size-4" aria-hidden />} />
      </section>

      {query.isLoading ? <PageSkeleton /> : query.isError ? (
        <ErrorState message={apiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : all.length === 0 ? (
        <Panel><EmptyState title="No shipments to plot" description="Plan a shipment with destination coordinates to see it here." icon={<MapPin className="size-5" aria-hidden />} /></Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
          <Panel className="p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="success" dot>Teal risk low</Badge>
                <Badge tone="danger" dot>Red open excursion</Badge>
                <Badge tone="info" dot>Selected route</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter map by shipment status" className="h-8 py-0 text-xs">
                  <option value="">All statuses</option>
                  {SHIPMENT_STATUSES.filter((value) => value !== "CANCELLED").map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
                </Select>
              </div>
            </div>
            <FleetMapCanvas
              shipments={visible}
              selectedId={selectedId}
              onSelect={(shipment) => setSelectedId(shipment.id)}
              height={480}
            />
            <p className="mt-2 px-1 text-[10px] text-mist">Routes are direct lines between committed origin, current and destination coordinates — not road routing. No interpolated positions are drawn.</p>
          </Panel>

          <div className="space-y-4">
            <Panel>
              <PanelHeader title={selected ? selected.code : "Select a shipment"} description={selected ? `${selected.destinationName} · ${humanize(selected.status)}` : "Choose a marker or list entry to inspect."} />
              {selected ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={statusTone(selected.status)} dot>{humanize(selected.status)}</Badge>
                    <Badge tone={riskTone(selected.riskScore)} dot>Risk {selected.riskScore}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-xl border border-line/60 bg-abyss/40 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-mist">Temperature</p>
                      <p className="stat-value mt-1 text-lg text-ice">{selected.temperature != null ? fmtTemp(selected.temperature) : "No data"}</p>
                      {selected.isSimulated ? <SimulatedBadge className="mt-1" /> : null}
                    </div>
                    <div className="rounded-xl border border-line/60 bg-abyss/40 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-mist">Progress</p>
                      <p className="stat-value mt-1 text-lg text-ice">{fmtPercent(selected.progressPercent)}</p>
                      <ProgressBar value={selected.progressPercent} tone="info" label={`${selected.code} progress`} className="mt-2" />
                    </div>
                  </div>
                  <div className="rounded-xl border border-line/60 bg-abyss/40 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-mist">Open excursions</p>
                    {selected.openExcursions.length === 0 ? <p className="mt-1 text-xs text-teal">None open</p> : (
                      <ul className="mt-1 space-y-1">
                        {selected.openExcursions.map((excursion) => (
                          <li key={excursion.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-mist">{humanize(excursion.type)}</span>
                            <Badge tone={excursion.severity === "CRITICAL" ? "danger" : "warning"}>{excursion.severity}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <Link to={`/app/shipments/${selected.id}`} className="inline-flex items-center gap-1 text-xs text-cyan hover:underline">Open shipment record <ArrowUpRight className="size-3.5" aria-hidden /></Link>
                </div>
              ) : <p className="text-xs text-mist">No shipment selected.</p>}
            </Panel>

            <Panel>
              <PanelHeader title="Plotted shipments" description={`${visible.length} visible · newest first`} />
              <ul className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
                {visible.map((shipment) => (
                  <li key={shipment.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(shipment.id)}
                      aria-pressed={shipment.id === selectedId}
                      className={`w-full rounded-xl border p-2.5 text-left transition-colors ${shipment.id === selectedId ? "border-cyan/40 bg-cyan/10" : "border-line/60 bg-abyss/30 hover:border-cyan/25"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-cyan">{shipment.code}</span>
                        <Badge tone={statusTone(shipment.status)}>{humanize(shipment.status)}</Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-ice">{shipment.destinationName}</p>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-mist">
                        <span>{shipment.progressPercent}% · {shipment.temperature != null ? fmtTemp(shipment.temperature) : "no telemetry"}</span>
                        <span>{shipment.openExcursions.length ? `${shipment.openExcursions.length} open` : `risk ${shipment.riskScore}`}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
