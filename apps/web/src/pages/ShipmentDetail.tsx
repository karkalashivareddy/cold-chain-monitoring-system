import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, MapPin, Navigation, PackageCheck, ShieldAlert, Truck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { daysUntil, fmtDateTime, fmtDuration, fmtNumber, fmtPercent, fmtRelative, fmtTemp, humanize, riskTone, severityTone, statusTone, toNumber } from "@/lib/format";
import type { Shipment } from "@/lib/types";
import { RouteMap } from "@/components/shipments/RouteMap";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Kpi,
  Modal,
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
  Textarea,
} from "@/components/ui";

type ShipmentDetailData = Shipment & {
  items: NonNullable<Shipment["items"]>;
  events: NonNullable<Shipment["events"]>;
  sensorAssignments: NonNullable<Shipment["sensorAssignments"]>;
  excursions: NonNullable<Shipment["excursions"]>;
};

function DeliverDialog({ open, onClose, shipment }: { open: boolean; onClose: () => void; shipment: ShipmentDetailData }) {
  const queryClient = useQueryClient();
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReceivedBy("");
    setNotes("");
    setError(null);
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => api.post<Shipment>(`/shipments/${shipment.id}/deliver`, { receivedBy: receivedBy.trim(), notes: notes.trim() || null }),
    onSuccess: () => {
      toast.success("Shipment marked delivered");
      void queryClient.invalidateQueries({ queryKey: ["shipments"] });
      void queryClient.invalidateQueries({ queryKey: ["batches"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  return (
    <Modal
      open={open}
      onOpenChange={(value) => !value && onClose()}
      title={`Deliver ${shipment.code}`}
      description="Confirmation is audited and publishes a realtime update after commit."
      size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={mutation.isPending} onClick={() => { setError(null); if (receivedBy.trim().length < 2) return setError("Receiver name is required."); mutation.mutate(); }}>Confirm delivery</Button></>}
    >
      <div className="space-y-4">
        <Field label="Received by" required>
          <Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="Name at receiving site" />
        </Field>
        <Field label="Delivery notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Temperature check at handover, packaging condition…" />
        </Field>
      </div>
      {error ? <p className="mt-4 rounded-lg border border-rose/30 bg-rose/10 p-2 text-xs text-rose" role="alert">{error}</p> : null}
    </Modal>
  );
}

function PositionDialog({ open, onClose, shipment }: { open: boolean; onClose: () => void; shipment: ShipmentDetailData }) {
  const queryClient = useQueryClient();
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [progress, setProgress] = useState("0");
  const [status, setStatus] = useState("IN_TRANSIT");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLat(shipment.currentLat != null ? String(toNumber(shipment.currentLat)) : "");
    setLng(shipment.currentLng != null ? String(toNumber(shipment.currentLng)) : "");
    setProgress(String(shipment.progressPercent));
    setStatus(shipment.status === "DISPATCHED" ? "IN_TRANSIT" : ["DELAYED", "IN_TRANSIT"].includes(shipment.status) ? shipment.status : "IN_TRANSIT");
    setMessage("");
  }, [open, shipment]);

  const mutation = useMutation({
    mutationFn: () =>
      api.patch<Shipment>(`/shipments/${shipment.id}/position`, {
        lat: Number(lat),
        lng: Number(lng),
        progressPercent: Number(progress),
        status,
        message: message.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Position checkpoint recorded");
      void queryClient.invalidateQueries({ queryKey: ["shipments"] });
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  return (
    <Modal
      open={open}
      onOpenChange={(value) => !value && onClose()}
      title="Record checkpoint"
      description="A position checkpoint is appended to the shipment event ledger and audited."
      size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={mutation.isPending} onClick={() => { setError(null); const la = Number(lat); const ln = Number(lng); const pr = Number(progress); if (!Number.isFinite(la) || la < -90 || la > 90) return setError("Latitude must be between -90 and 90."); if (!Number.isFinite(ln) || ln < -180 || ln > 180) return setError("Longitude must be between -180 and 180."); if (!Number.isFinite(pr) || pr < 0 || pr > 100) return setError("Progress must be between 0 and 100."); mutation.mutate(); }}>Save checkpoint</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Latitude" required><Input type="number" step="0.000001" value={lat} onChange={(e) => setLat(e.target.value)} /></Field>
        <Field label="Longitude" required><Input type="number" step="0.000001" value={lng} onChange={(e) => setLng(e.target.value)} /></Field>
        <Field label="Progress %" required><Input type="number" min={0} max={100} value={progress} onChange={(e) => setProgress(e.target.value)} /></Field>
        <Field label="Status">
          <select className="w-full rounded-xl border border-line bg-abyss/60 px-3 py-2 text-sm text-ice" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="IN_TRANSIT">In transit</option>
            <option value="DISPATCHED">Dispatched</option>
            <option value="DELAYED">Delayed</option>
          </select>
        </Field>
        <Field label="Event message" className="sm:col-span-2">
          <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Crossed Chitradurga checkpoint" />
        </Field>
      </div>
      {error ? <p className="mt-4 rounded-lg border border-rose/30 bg-rose/10 p-2 text-xs text-rose" role="alert">{error}</p> : null}
    </Modal>
  );
}

export default function ShipmentDetailPage() {
  const { id = "" } = useParams();
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [positionOpen, setPositionOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);

  const query = useQuery({
    queryKey: ["shipments", id],
    queryFn: () => api.get<ShipmentDetailData>(`/shipments/${id}`),
    enabled: Boolean(id),
  });

  const dispatch = useMutation({
    mutationFn: () => api.post<Shipment>(`/shipments/${id}/dispatch`),
    onSuccess: () => {
      toast.success("Shipment dispatched · stock reserved atomically");
      setDispatchOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["shipments"] });
      void queryClient.invalidateQueries({ queryKey: ["batches"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const cancel = useMutation({
    mutationFn: () => api.post<Shipment>(`/shipments/${id}/cancel`),
    onSuccess: () => {
      toast.success("Shipment cancelled");
      setCancelOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["shipments"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const shipment = query.data;
  const origin = useMemo(
    () => (shipment?.originLat != null && shipment.originLng != null ? { lat: Number(toNumber(shipment.originLat)), lng: Number(toNumber(shipment.originLng)) } : null),
    [shipment]
  );
  const destination = useMemo(
    () => (shipment ? { lat: Number(toNumber(shipment.destinationLat)), lng: Number(toNumber(shipment.destinationLng)) } : null),
    [shipment]
  );
  const current = useMemo(
    () => (shipment?.currentLat != null && shipment.currentLng != null ? { lat: Number(toNumber(shipment.currentLat)), lng: Number(toNumber(shipment.currentLng)) } : null),
    [shipment]
  );

  if (query.isLoading) return <PageSkeleton />;
  if (query.isError || !shipment) {
    return (
      <div className="space-y-4">
        <Link to="/app/shipments" className="inline-flex items-center gap-1 text-xs text-mist hover:text-ice"><ArrowLeft className="size-3.5" aria-hidden /> Back to shipments</Link>
        <ErrorState message={apiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const readings = shipment.sensorAssignments.flatMap((assignment) => assignment.sensor.readings ?? []);
  const latest = readings.slice().sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())[0];
  const totalUnits = shipment.items.reduce((sum, item) => sum + item.quantity, 0);
  const isActive = ["DISPATCHED", "IN_TRANSIT", "DELAYED"].includes(shipment.status);
  const canDispatch = hasPermission("shipment:dispatch");
  const canWrite = hasPermission("shipment:write");
  const late = shipment.estimatedArrivalAt ? new Date(shipment.estimatedArrivalAt).getTime() < Date.now() && shipment.status !== "DELIVERED" : false;

  return (
    <div className="space-y-5">
      <div>
        <Link to="/app/shipments" className="inline-flex items-center gap-1 text-xs text-mist hover:text-ice"><ArrowLeft className="size-3.5" aria-hidden /> Back to shipments</Link>
        <PageHeader
          className="mt-3"
          eyebrow="Shipment record"
          title={shipment.code}
          description={`${shipment.originWarehouse?.name ?? "Origin"} → ${shipment.destinationName}${shipment.destinationCity ? `, ${shipment.destinationCity}` : ""}`}
          actions={
            <>
              <Badge tone={statusTone(shipment.status)} dot>{humanize(shipment.status)}</Badge>
              {canWrite && ["DRAFT", "PLANNED"].includes(shipment.status) ? (
                <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)}><XCircle className="size-3.5" aria-hidden /> Cancel</Button>
              ) : null}
              {canDispatch && ["DRAFT", "PLANNED"].includes(shipment.status) ? (
                <Button size="sm" onClick={() => setDispatchOpen(true)}><Truck className="size-3.5" aria-hidden /> Dispatch</Button>
              ) : null}
              {canDispatch && isActive ? (
                <>
                  {canWrite ? <Button variant="secondary" size="sm" onClick={() => setPositionOpen(true)}><Navigation className="size-3.5" aria-hidden /> Checkpoint</Button> : null}
                  <Button variant="success" size="sm" onClick={() => setDeliverOpen(true)}><CheckCircle2 className="size-3.5" aria-hidden /> Deliver</Button>
                </>
              ) : null}
            </>
          }
        />
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Cargo" value={`${fmtNumber(totalUnits)} units`} hint={`${shipment.items.length} batch lines`} tone="info" icon={<PackageCheck className="size-4" aria-hidden />} />
        <Kpi label="Progress" value={fmtPercent(shipment.progressPercent)} hint={shipment.deliveredAt ? `Delivered ${fmtDateTime(shipment.deliveredAt)}` : shipment.estimatedArrivalAt ? `ETA ${fmtDateTime(shipment.estimatedArrivalAt)}` : "ETA not set"} tone={shipment.status === "DELAYED" ? "warning" : "success"} />
        <Kpi label="Risk score" value={shipment.riskScore} hint={`${shipment.excursions.filter((excursion) => excursion.status === "OPEN").length} open excursion(s)`} tone={riskTone(shipment.riskScore)} icon={<ShieldAlert className="size-4" aria-hidden />} />
        <Kpi label="Latest temperature" value={latest ? fmtTemp(latest.temperature) : "No reading"} hint={latest ? `${latest.isSimulated ? "Simulated · " : ""}${fmtRelative(latest.recordedAt)}` : "No sensor currently assigned"} tone={latest ? "violet" : "neutral"} />
      </section>

      {late ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber/30 bg-amber/5 p-3 text-xs text-amber">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>Estimated arrival has passed and the shipment is still {humanize(shipment.status).toLowerCase()}. Record a checkpoint or contact the driver.</p>
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Route"
            description="Dashed line is the planned direct route. The blue marker is the last recorded checkpoint."
            action={<Badge tone="neutral"><MapPin className="size-3" aria-hidden /> OpenStreetMap</Badge>}
          />
          <RouteMap origin={origin} destination={destination} current={current} height={330} />
          <div className="mt-3 grid gap-2 border-t border-line/40 pt-3 text-[11px] text-mist sm:grid-cols-3">
            <div><p className="text-[10px] uppercase tracking-wider text-mist/70">Origin</p><p className="mt-0.5 text-ice">{shipment.originWarehouse?.name ?? "—"}</p><p>{shipment.originWarehouse?.city ?? "—"}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-mist/70">Destination</p><p className="mt-0.5 text-ice">{shipment.destinationName}</p><p>{shipment.destinationCity ?? "—"}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-mist/70">Vehicle</p><p className="mt-0.5 text-ice">{shipment.vehicle?.plateNumber ?? "Not assigned"}</p><p>{shipment.driver?.fullName ?? "Driver not assigned"}</p></div>
          </div>
          <div className="mt-3"><ProgressBar value={shipment.progressPercent} tone={shipment.status === "DELAYED" ? "warning" : "info"} label="Shipment progress" /></div>
        </Panel>

        <Panel>
          <PanelHeader title="Telemetry" description="Latest persisted reading from each assigned sensor." action={readings.some((reading) => reading.isSimulated) ? <SimulatedBadge /> : null} />
          {shipment.sensorAssignments.length === 0 ? (
            <EmptyState title="No sensor attached" description="Assign a device to this shipment to collect in-transit temperature evidence." />
          ) : (
            <ul className="space-y-2">
              {shipment.sensorAssignments.map((assignment) => {
                const device = assignment.sensor;
                const reading = device.readings?.[0];
                return (
                  <li key={device.id} className="rounded-xl border border-line/60 bg-abyss/40 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div><p className="text-xs font-medium text-ice">{device.name}</p><p className="font-mono text-[10px] text-mist">{device.deviceId}</p></div>
                      <Badge tone={statusTone(device.status)} dot>{humanize(device.status)}</Badge>
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div>
                        <p className="stat-value text-xl text-ice">{reading ? fmtTemp(reading.temperature) : "—"}</p>
                        <p className="text-[10px] text-mist">{reading ? fmtRelative(reading.recordedAt) : "No readings"}</p>
                      </div>
                      {reading?.isSimulated ? <SimulatedBadge /> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 border-t border-line/40 pt-3 text-[10px] text-mist">Excursion evaluation is server-side; the UI does not derive compliance from these values.</p>
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader title="Cargo manifest" description="Batch-level stock, product envelope and expiry at time of view." />
          <TableWrap>
            <thead><tr><TH>Batch</TH><TH>Product</TH><TH>Quantity</TH><TH>Envelope</TH><TH>Expires</TH></tr></thead>
            <tbody>
              {shipment.items.map((item) => {
                const batch = item.batch;
                const days = batch ? daysUntil(batch.expiresAt) : null;
                return (
                  <TR key={item.id}>
                    <TD>{batch ? <Link to={`/app/batches/${batch.id}`} className="font-mono text-xs text-cyan hover:underline">{batch.batchNumber}</Link> : "—"}</TD>
                    <TD><p className="text-xs text-ice">{batch?.product?.name ?? "—"}</p><p className="text-[10px] text-mist">{batch?.product?.code}</p></TD>
                    <TD className="stat-value">{fmtNumber(item.quantity)}</TD>
                    <TD className="stat-value whitespace-nowrap text-xs">{fmtTemp(batch?.product?.minTemp)} – {fmtTemp(batch?.product?.maxTemp)}</TD>
                    <TD className="whitespace-nowrap text-xs">{batch ? fmtDateTime(batch.expiresAt) : "—"}{days !== null ? <span className={`ml-1 ${days < 30 ? "text-amber" : "text-mist"}`}>({days}d)</span> : null}</TD>
                  </TR>
                );
              })}
            </tbody>
          </TableWrap>
        </Panel>

        <Panel>
          <PanelHeader title="Shipment risk" description="Live server-side score and excursion context." />
          <div className="flex items-center gap-3">
            <p className="stat-value text-4xl font-semibold text-ice">{shipment.riskScore}</p>
            <Badge tone={riskTone(shipment.riskScore)} dot>{shipment.riskScore >= 75 ? "Severe" : shipment.riskScore >= 55 ? "High" : shipment.riskScore >= 30 ? "Medium" : "Low"}</Badge>
          </div>
          <ProgressBar value={shipment.riskScore} tone={riskTone(shipment.riskScore)} label="Shipment risk score" className="mt-3" />
          <dl className="mt-4 space-y-2 text-xs">
            <div className="flex justify-between gap-3"><dt className="text-mist">Open excursions</dt><dd className="text-ice">{shipment.excursions.filter((excursion) => excursion.status === "OPEN").length}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-mist">Planned departure</dt><dd className="text-right text-ice">{shipment.plannedDepartureAt ? fmtDateTime(shipment.plannedDepartureAt) : "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-mist">Dispatched</dt><dd className="text-right text-ice">{shipment.dispatchedAt ? fmtDateTime(shipment.dispatchedAt) : "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-mist">Delivered</dt><dd className="text-right text-ice">{shipment.deliveredAt ? fmtDateTime(shipment.deliveredAt) : "—"}</dd></div>
          </dl>
          {shipment.notes ? <p className="mt-3 border-t border-line/40 pt-3 text-[11px] leading-relaxed text-mist">{shipment.notes}</p> : null}
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Excursions on this shipment" description="Server-evaluated temperature excursions, newest first." />
          {shipment.excursions.length === 0 ? (
            <EmptyState title="No excursions" description="No temperature excursion has been recorded on this shipment." />
          ) : (
            <ul className="space-y-2">
              {shipment.excursions.map((excursion) => (
                <li key={excursion.id} className="rounded-xl border border-line/60 bg-abyss/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge tone={severityTone(excursion.severity)} dot>{excursion.severity}</Badge>
                    <span className="text-[10px] text-mist">{excursion.status} · {fmtDuration(excursion.durationSeconds)}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-ice">{fmtTemp(excursion.minTemp)} – {fmtTemp(excursion.maxTemp)} <span className="text-mist">against {fmtTemp(excursion.thresholdMin)} – {fmtTemp(excursion.thresholdMax)}</span></p>
                  <p className="text-[10px] text-mist">Started {fmtDateTime(excursion.startedAt)}{excursion.endedAt ? ` · ended ${fmtDateTime(excursion.endedAt)}` : " · ongoing"}</p>
                  {excursion.incident ? <Link to={`/app/incidents/${excursion.incident.id}`} className="mt-1 inline-block text-[11px] text-cyan hover:underline">Incident {excursion.incident.code}</Link> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Event ledger" description="Append-only operational events recorded against this shipment." />
          {shipment.events.length === 0 ? (
            <EmptyState title="No events" description="Events appear as the shipment progresses." />
          ) : (
            <ol className="relative space-y-4 border-l border-line/70 pl-5">
              {shipment.events.map((event) => (
                <li key={event.id} className="relative">
                  <span className="absolute -left-[1.42rem] top-1 size-2 rounded-full bg-cyan ring-4 ring-abyss" aria-hidden />
                  <p className="text-[10px] uppercase tracking-wider text-mist">{fmtDateTime(event.occurredAt)} · {humanize(event.type)}</p>
                  <p className="mt-0.5 text-xs text-ice">{event.message}</p>
                  <p className="text-[10px] text-mist">{event.createdBy?.fullName ?? "System"}</p>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </section>

      <DeliverDialog open={deliverOpen} onClose={() => setDeliverOpen(false)} shipment={shipment} />
      <PositionDialog open={positionOpen} onClose={() => setPositionOpen(false)} shipment={shipment} />
      <ConfirmDialog
        open={dispatchOpen}
        onOpenChange={setDispatchOpen}
        tone="primary"
        title="Dispatch shipment"
        description="Dispatching reserves stock through the stored procedure inside a serializable transaction. This cannot be undone."
        confirmLabel="Dispatch now"
        loading={dispatch.isPending}
        onConfirm={() => dispatch.mutate()}
      />
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel shipment"
        description="Only planned shipments can be cancelled. The cancellation is audited."
        confirmLabel="Cancel shipment"
        loading={cancel.isPending}
        onConfirm={() => cancel.mutate()}
      />
    </div>
  );
}
