import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, MapPin, Navigation, RefreshCw, ShieldAlert, Snowflake, Truck } from "lucide-react";
import { SHIPMENT_STATUSES } from "@frostguard/shared";
import { api, apiErrorMessage } from "@/lib/api";
import { fmtPercent, fmtRelative, fmtTemp, humanize, riskTone, statusTone } from "@/lib/format";
import type { ShipmentMapPoint } from "@/lib/types";
import { FleetMapCanvas } from "@/components/shipments/RouteMap";
import { Badge, Button, EmptyState, ErrorState, Input, Kpi, PageHeader, PageSkeleton, Panel, PanelHeader, ProgressBar, Select, SimulatedBadge } from "@/components/ui";

export default function FleetMapPage() {
  const [status, setStatus] = useState("");
  const [risk, setRisk] = useState("");
  const [search, setSearch] = useState("");
  const [focusKey, setFocusKey] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["shipments", "map"], queryFn: () => api.get<ShipmentMapPoint[]>("/shipments/map"), refetchInterval: 30_000 });
  const all = query.data ?? [];
  const visible = useMemo(() => all.filter((shipment) => {
    if (status && shipment.status !== status) return false;
    if (risk === "critical" && !shipment.openExcursions.some((excursion) => excursion.severity === "CRITICAL")) return false;
    if (risk === "excursion" && shipment.openExcursions.length === 0) return false;
    if (risk === "clear" && shipment.openExcursions.length > 0) return false;
    if (risk === "located" && shipment.current == null) return false;
    if (risk === "unlocated" && shipment.current != null) return false;
    const needle = search.trim().toLocaleLowerCase();
    return !needle || `${shipment.code} ${shipment.destinationName} ${shipment.status}`.toLocaleLowerCase().includes(needle);
  }), [all, status, risk, search]);

  useEffect(() => {
    if (visible.length === 0) { setSelectedId(null); return; }
    if (!selectedId || !visible.some((shipment) => shipment.id === selectedId)) setSelectedId(visible[0]!.id);
  }, [visible, selectedId]);

  const selected = visible.find((shipment) => shipment.id === selectedId) ?? null;
  const critical = visible.reduce((sum, shipment) => sum + shipment.openExcursions.filter((excursion) => excursion.severity === "CRITICAL").length, 0);
  const missingTelemetry = visible.filter((shipment) => shipment.temperature == null).length;
  const simulatedCount = visible.filter((shipment) => shipment.isSimulated).length;
  const averageProgress = visible.length ? Math.round(visible.reduce((sum, shipment) => sum + shipment.progressPercent, 0) / visible.length) : 0;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Command" title="Live fleet map" description="Shipment endpoints are shown as a direct geographic connection. Vehicle markers appear only when a position has an explicit source. Data refreshes every 30 seconds." actions={<><Badge tone="neutral"><MapPin className="size-3" aria-hidden /> OpenStreetMap tiles</Badge><Button variant="secondary" size="sm" loading={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className="size-3.5" aria-hidden /> Refresh</Button></>} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Shipment records" value={visible.length} hint="Non-cancelled records in current filters" tone="info" icon={<Truck className="size-4" aria-hidden />} />
        <Kpi label="Avg. progress" value={fmtPercent(averageProgress)} hint="Committed progress values" tone="success" icon={<Navigation className="size-4" aria-hidden />} />
        <Kpi label="Critical open excursions" value={critical} hint="Shipment-linked excursions in this view" tone={critical ? "danger" : "success"} icon={<ShieldAlert className="size-4" aria-hidden />} />
        <Kpi label="No temperature reading" value={missingTelemetry} hint={`${simulatedCount} latest sensor readings are simulated`} tone={missingTelemetry ? "warning" : "success"} icon={<Snowflake className="size-4" aria-hidden />} />
      </section>

      {query.isLoading ? <PageSkeleton /> : query.isError ? <ErrorState message={apiErrorMessage(query.error)} onRetry={() => void query.refetch()} /> : all.length === 0 ? (
        <Panel><EmptyState title="No shipments to show" description="Create a shipment with origin and destination coordinates to see its geographic connection." icon={<MapPin className="size-5" aria-hidden />} /></Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
          <Panel className="p-3 sm:p-4">
            <div className="mb-3 space-y-3 px-1">
              <div className="flex flex-wrap items-center gap-2" aria-label="Map legend"><Badge tone="success" dot>Origin</Badge><Badge tone="violet" dot>Destination</Badge><Badge tone="info" dot>Sourced vehicle position</Badge><Badge tone="warning" dot>Open excursion</Badge><Badge tone="danger" dot>Critical excursion</Badge><Badge tone="info" dot>Selected route</Badge></div>
              <div className="flex flex-wrap items-center gap-2">
                <Input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search shipments on map" placeholder="Search shipment or destination" className="h-9 min-w-48 flex-1 py-0 text-xs sm:flex-none" />
                <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter map by shipment status" className="h-9 py-0 text-xs"><option value="">All statuses</option>{SHIPMENT_STATUSES.filter((value) => value !== "CANCELLED").map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</Select>
                <Select value={risk} onChange={(event) => setRisk(event.target.value)} aria-label="Filter map by excursion or position" className="h-9 py-0 text-xs"><option value="">All risk and positions</option><option value="critical">Critical excursion</option><option value="excursion">Any open excursion</option><option value="clear">No open excursion</option><option value="located">Position available</option><option value="unlocated">Position unavailable</option></Select>
              </div>
            </div>
            {visible.length ? <FleetMapCanvas shipments={visible} selectedId={selectedId} focusKey={focusKey} onSelect={(shipment) => { setSelectedId(shipment.id); setFocusKey(""); }} height={480} /> : <div className="flex min-h-72 items-center justify-center"><EmptyState title="No matching shipments" description="Adjust the search or map filters to see other records." /></div>}
            <p className="mt-2 px-1 text-[11px] text-mist">Dashed connections are direct geographic lines, not road routes. No interpolated movement is drawn. A marker appears only for a sourced vehicle position; origin and destination remain separate endpoints.</p>
          </Panel>

          <div className="space-y-4">
            <Panel>
              <PanelHeader title={selected ? selected.code : "Select a shipment"} description={selected ? `${selected.destinationName} · ${humanize(selected.status)}` : "Choose a marker or list entry to inspect."} />
              {selected ? <div className="space-y-3">
                <div className="flex items-center justify-between gap-2"><Badge tone={statusTone(selected.status)} dot>{humanize(selected.status)}</Badge><Badge tone={riskTone(selected.riskScore)} dot>Risk {selected.riskScore}</Badge></div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-xl border border-line/60 bg-abyss/40 p-3"><p className="text-[10px] uppercase tracking-wider text-mist">Temperature</p><p className="stat-value mt-1 text-lg text-ice">{selected.temperature != null ? fmtTemp(selected.temperature) : "No data"}</p>{selected.isSimulated ? <SimulatedBadge className="mt-1" /> : null}</div>
                  <div className="rounded-xl border border-line/60 bg-abyss/40 p-3"><p className="text-[10px] uppercase tracking-wider text-mist">Progress</p><p className="stat-value mt-1 text-lg text-ice">{fmtPercent(selected.progressPercent)}</p><ProgressBar value={selected.progressPercent} tone="info" label={`${selected.code} progress`} className="mt-2" /></div>
                </div>
                <div className="rounded-xl border border-line/60 bg-abyss/40 p-3"><p className="text-[10px] uppercase tracking-wider text-mist">Vehicle position</p>{selected.current ? <p className="mt-1 text-xs text-ice">{selected.positionSource === "SIMULATED" ? "Simulated demo position" : "Operator-reported checkpoint"} · {fmtRelative(selected.positionUpdatedAt)}</p> : <p className="mt-1 text-xs text-amber">Location unavailable · no current position is recorded</p>}</div>
                <div className="rounded-xl border border-line/60 bg-abyss/40 p-3"><p className="text-[10px] uppercase tracking-wider text-mist">Open excursions on shipment</p>{selected.openExcursions.length === 0 ? <p className="mt-1 text-xs text-teal">None open</p> : <ul className="mt-1 space-y-1">{selected.openExcursions.map((excursion) => <li key={excursion.id} className="flex items-center justify-between gap-2 text-xs"><span className="text-mist">{humanize(excursion.type)}</span><Badge tone={excursion.severity === "CRITICAL" ? "danger" : "warning"}>{excursion.severity}</Badge></li>)}</ul>}</div>
                <Link to={`/app/shipments/${selected.id}`} className="inline-flex items-center gap-1 text-xs text-cyan hover:underline">Open shipment record <ArrowUpRight className="size-3.5" aria-hidden /></Link>
              </div> : <p className="text-xs text-mist">No shipment selected.</p>}
            </Panel>

            <Panel>
              <PanelHeader title="Shipment list" description={`${visible.length} visible · newest first`} />
              <ul className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">{visible.map((shipment) => <li key={shipment.id}>
                <button type="button" onClick={() => { setSelectedId(shipment.id); setFocusKey(String(Date.now())); }} aria-pressed={shipment.id === selectedId} className={`w-full rounded-xl border p-2.5 text-left transition-colors ${shipment.id === selectedId ? "border-cyan/40 bg-cyan/10" : "border-line/60 bg-abyss/30 hover:border-cyan/25"}`}>
                  <div className="flex items-center justify-between gap-2"><span className="font-mono text-[11px] text-cyan">{shipment.code}</span><Badge tone={statusTone(shipment.status)}>{humanize(shipment.status)}</Badge></div>
                  <p className="mt-1 truncate text-xs text-ice">{shipment.destinationName}</p>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px] text-mist"><span>{shipment.temperature != null ? fmtTemp(shipment.temperature) : "no temperature reading"} · {shipment.current ? `position ${fmtRelative(shipment.positionUpdatedAt)}` : "location unavailable"}</span><span>{shipment.openExcursions.length ? `${shipment.openExcursions.length} open` : `risk ${shipment.riskScore}`}</span></div>
                  {shipment.isSimulated || shipment.positionSource === "SIMULATED" ? <span className="mt-1 inline-flex"><SimulatedBadge /></span> : null}
                </button>
              </li>)}</ul>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
