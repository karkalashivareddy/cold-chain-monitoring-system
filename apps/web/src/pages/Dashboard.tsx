import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Boxes,
  CircleCheck,
  Map,
  Radio,
  RefreshCw,
  Siren,
  Thermometer,
  Truck,
  Warehouse,
} from "lucide-react";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDateTime, fmtNumber, fmtPercent, fmtRelative, fmtTemp, riskTone, severityTone, statusTone } from "@/lib/format";
import type { DashboardData } from "@/lib/types";
import { ExcursionBarChart, SeverityDonut, TemperatureTrendChart } from "@/components/Charts";
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
  SimulatedBadge,
  TD,
  TH,
  TR,
  TableWrap,
} from "@/components/ui";

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardData>("/dashboard"),
    refetchInterval: 30_000,
  });

  if (isLoading) return <PageSkeleton />;
  if (isError || !data) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Command centre" title="Cold-chain overview" />
        <ErrorState message={apiErrorMessage(error)} onRetry={() => void refetch()} />
      </div>
    );
  }

  const { kpis } = data;
  const simulatedLatest = data.latestReadings.filter((r) => Boolean(r.isSimulated)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Command centre"
        title="Cold-chain overview"
        description={`Operational picture for ${user?.organization.name ?? "your organization"}. Every figure below is read from the live API for this tenant.`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void refetch()} loading={isFetching}>
              <RefreshCw className="size-3.5" aria-hidden />
              Refresh
            </Button>
            <Link to="/app/map">
              <Button size="sm">
                <Map className="size-3.5" aria-hidden />
                Live fleet map
              </Button>
            </Link>
          </>
        }
      />

      <section aria-label="Key performance indicators" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <Kpi
          label="Active shipments"
          value={fmtNumber(kpis.activeShipments)}
          hint={`${fmtNumber(kpis.safeShipments)} currently within profile`}
          tone="info"
          icon={<Truck className="size-4" aria-hidden />}
        />
        <Kpi
          label="Open excursions"
          value={fmtNumber(kpis.activeExcursions)}
          hint="Temperature deviations awaiting recovery"
          tone={kpis.activeExcursions > 0 ? "warning" : "success"}
          icon={<Thermometer className="size-4" aria-hidden />}
        />
        <Kpi
          label="Critical incidents"
          value={fmtNumber(kpis.criticalIncidents)}
          hint="Open, acknowledged or investigating"
          tone={kpis.criticalIncidents > 0 ? "danger" : "success"}
          icon={<Siren className="size-4" aria-hidden />}
        />
        <Kpi
          label="Devices online"
          value={fmtNumber(kpis.connectedDevices)}
          hint={`${fmtNumber(kpis.offlineDevices)} offline right now`}
          tone={kpis.offlineDevices > 0 ? "warning" : "success"}
          icon={<Radio className="size-4" aria-hidden />}
        />
        <Kpi
          label="Batches at risk"
          value={fmtNumber(kpis.atRiskBatches)}
          hint="Expiring within the risk window"
          tone={kpis.atRiskBatches > 0 ? "warning" : "success"}
          icon={<Boxes className="size-4" aria-hidden />}
        />
        <Kpi
          label="On-time deliveries"
          value={fmtPercent(kpis.onTimeRate)}
          hint={`${fmtNumber(kpis.onTimeDeliveries)} of ${fmtNumber(kpis.deliveredShipments30d)} delivered in 30 days`}
          tone="success"
          icon={<CircleCheck className="size-4" aria-hidden />}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Temperature envelope · last 24 hours"
            description="Average, minimum and maximum across every sensor in this organization."
            action={<Badge tone="info" dot>30-minute buckets</Badge>}
          />
          <TemperatureTrendChart data={data.temperatureTrend} height={280} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/40 pt-3 text-[10px] text-mist">
            <span className="flex items-center gap-2">
              <span className={cnDot("bg-cyan")} aria-hidden /> average
              <span className={cnDot("bg-teal")} aria-hidden /> minimum
              <span className={cnDot("bg-cyan/40")} aria-hidden /> max band
            </span>
            <span>
              {fmtNumber(data.temperatureTrend.reduce((sum, point) => sum + point.count, 0))} readings aggregated
            </span>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Alert severity · 30 days" description="Raised by the excursion engine after commit." />
          <SeverityDonut data={data.alertSeverity} height={190} />
          <Link to="/app/alerts" className="mt-2 inline-flex items-center gap-1 text-xs text-cyan hover:underline">
            Open alert queue <ArrowRight className="size-3" aria-hidden />
          </Link>
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Shipments under risk"
            description="Active shipments ordered by the server-computed risk score."
            action={
              <Link to="/app/shipments" className="text-xs text-cyan hover:underline">
                All shipments
              </Link>
            }
          />
          {data.riskByShipment.length === 0 ? (
            <EmptyState title="No active shipments" description="Plan a shipment to begin monitoring its route." />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <TH>Shipment</TH>
                  <TH>Destination</TH>
                  <TH>Status</TH>
                  <TH className="w-40">Progress</TH>
                  <TH>Risk</TH>
                  <TH className="text-right">Open excursions</TH>
                </tr>
              </thead>
              <tbody>
                {data.riskByShipment.slice(0, 8).map((shipment) => (
                  <TR key={shipment.id}>
                    <TD>
                      <Link to={`/app/shipments/${shipment.id}`} className="font-mono text-xs text-cyan hover:underline">
                        {shipment.code}
                      </Link>
                    </TD>
                    <TD className="max-w-[14rem] truncate">{shipment.destinationName}</TD>
                    <TD>
                      <Badge tone={statusTone(shipment.status)} dot>
                        {shipment.status.replace(/_/g, " ")}
                      </Badge>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <ProgressBar value={shipment.progressPercent} tone="info" label={`${shipment.code} progress`} />
                        <span className="stat-value w-9 text-right text-[11px] text-mist">{shipment.progressPercent}%</span>
                      </div>
                    </TD>
                    <TD>
                      <Badge tone={riskTone(shipment.riskScore)}>{shipment.riskScore}</Badge>
                    </TD>
                    <TD className="text-right">
                      {shipment.excursions.length > 0 ? (
                        <Badge tone="danger">{shipment.excursions.length}</Badge>
                      ) : (
                        <span className="text-xs text-mist">—</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Storage units to watch" description="Highest excursion counts in the last 30 days." />
          {data.topRiskUnits.length === 0 ? (
            <EmptyState title="No storage units yet" description="Register a cold room or freezer to start monitoring." />
          ) : (
            <ul className="space-y-2.5">
              {data.topRiskUnits.map((unit) => (
                <li key={unit.id} className="rounded-xl border border-line/60 bg-abyss/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to="/app/storage-units" className="block truncate text-sm font-medium text-ice hover:text-cyan">
                        {unit.name}
                      </Link>
                      <p className="truncate text-[11px] text-mist">{unit.warehouse}</p>
                    </div>
                    <span className="stat-value shrink-0 text-sm text-ice">{fmtTemp(unit.lastTemp)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-mist">
                    <span>{unit.excursions} excursions</span>
                    {unit.open > 0 ? (
                      <Badge tone="danger" dot>
                        {unit.open} open
                      </Badge>
                    ) : (
                      <Badge tone="success" dot>
                        stable
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Excursion frequency · 14 days"
            description="Excursions raised per calendar day, split by critical severity."
            action={<Badge tone="warning">{fmtNumber(data.excursionFrequency.reduce((sum, d) => sum + d.total, 0))} total</Badge>}
          />
          <ExcursionBarChart data={data.excursionFrequency} height={240} />
        </Panel>

        <Panel>
          <PanelHeader
            title="Latest readings"
            description="Newest telemetry rows across all sensors."
            action={
              simulatedLatest > 0 ? <SimulatedBadge /> : <Badge tone="success" dot>Live</Badge>
            }
          />
          {data.latestReadings.length === 0 ? (
            <EmptyState title="No telemetry yet" description="Readings appear here once a device reports." />
          ) : (
            <ul className="divide-y divide-line/40">
              {data.latestReadings.map((reading) => (
                <li key={String(reading.id)} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-ice">{reading.sensor?.name ?? reading.sensorId}</p>
                    <p className="truncate font-mono text-[10px] text-mist">{reading.sensor?.deviceId}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="stat-value text-sm font-semibold text-ice">{fmtTemp(reading.temperature)}</p>
                    <p className="text-[10px] text-mist">{fmtRelative(reading.recordedAt)}</p>
                    <div className="mt-1 flex justify-end">
                      {reading.isSimulated ? <SimulatedBadge /> : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {simulatedLatest > 0 ? (
            <p className="mt-3 rounded-lg border border-violet/20 bg-violet/5 p-2 text-[10px] leading-relaxed text-mist">
              {simulatedLatest} of the latest {data.latestReadings.length} readings are explicitly marked simulated. They are
              never presented as physical sensor truth.
            </p>
          ) : null}
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Panel>
          <PanelHeader
            title="Warehouse performance · 30 days"
            description="Units, batches, excursions and mean temperature by site."
            action={<Warehouse className="size-4 text-mist" aria-hidden />}
          />
          {data.warehousePerformance.length === 0 ? (
            <EmptyState title="No warehouses" description="Add a warehouse to group storage units and shipments." />
          ) : (
            <ul className="space-y-3">
              {data.warehousePerformance.map((warehouse) => (
                <li key={warehouse.id} className="rounded-xl border border-line/60 bg-abyss/40 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ice">{warehouse.name}</p>
                      <p className="text-[11px] text-mist">{warehouse.city ?? "Location not set"}</p>
                    </div>
                    <span className="stat-value text-xs text-ice">{fmtTemp(warehouse.averageTemperature)}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[10px] text-mist">
                    <div className="rounded-lg bg-white/[0.03] py-1.5">
                      <p className="stat-value text-sm text-ice">{warehouse.units}</p>
                      units
                    </div>
                    <div className="rounded-lg bg-white/[0.03] py-1.5">
                      <p className="stat-value text-sm text-ice">{warehouse.batches}</p>
                      batches
                    </div>
                    <div className="rounded-lg bg-white/[0.03] py-1.5">
                      <p className={warehouse.excursions > 0 ? "stat-value text-sm text-amber" : "stat-value text-sm text-ice"}>
                        {warehouse.excursions}
                      </p>
                      excursions
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Recent activity"
            description="Audited actions and alerts, newest first."
            action={
              <Link to="/app/audit" className="text-xs text-cyan hover:underline">
                Full audit trail
              </Link>
            }
          />
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-mist/60">Audit events</p>
              {data.activity.audit.length === 0 ? (
                <p className="text-xs text-mist">No audit events recorded.</p>
              ) : (
                <ol className="space-y-2.5">
                  {data.activity.audit.slice(0, 8).map((entry) => (
                    <li key={String(entry.id)} className="flex gap-2.5">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-cyan/70" aria-hidden />
                      <div className="min-w-0">
                        <p className="truncate text-xs text-ice">
                          <span className="font-medium">{entry.actor?.fullName ?? "System"}</span>{" "}
                          <span className="text-mist">{entry.action.replace(/[._]/g, " ")}</span>{" "}
                          <span className="text-mist/70">{entry.entityType}</span>
                        </p>
                        <p className="text-[10px] text-mist/70">{fmtDateTime(entry.createdAt)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-mist/60">Alerts</p>
              {data.activity.alerts.length === 0 ? (
                <p className="text-xs text-mist">No alerts raised.</p>
              ) : (
                <ul className="space-y-2.5">
                  {data.activity.alerts.map((alert) => (
                    <li key={alert.id} className="rounded-lg border border-line/50 bg-abyss/30 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-xs text-ice">{alert.title}</p>
                        <Badge tone={severityTone(alert.severity)}>{alert.severity}</Badge>
                      </div>
                      <p className="mt-1 text-[10px] text-mist">
                        {alert.excursion?.sensor?.name ? `${alert.excursion.sensor.name} · ` : ""}
                        {fmtRelative(alert.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Panel>
      </section>

      <section className="panel flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-start gap-3">
          <Activity className="mt-0.5 size-4 shrink-0 text-teal" aria-hidden />
          <div>
            <p className="text-xs font-semibold text-ice">Telemetry provenance</p>
            <p className="mt-0.5 max-w-3xl text-[11px] leading-relaxed text-mist">
              Readings arrive through the authenticated device endpoint and are persisted before they appear here. Simulated
              readings from the deterministic seed or the built-in simulator carry an explicit simulated flag and are labelled
              everywhere in the console.
            </p>
          </div>
        </div>
        <Link to="/app/devices" className="text-xs text-cyan hover:underline">
          Inspect devices
        </Link>
      </section>
    </div>
  );
}

function cnDot(color: string) {
  return `inline-block size-1.5 rounded-full ${color}`;
}
