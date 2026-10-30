import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, KeyRound, Pencil, Plus, Radio, Search, ShieldOff, Thermometer, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { SIMULATION_SCENARIOS, type SimulationScenario } from "@frostguard/shared";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { daysUntil, fmtDateTime, fmtRelative, fmtTemp, humanize, statusTone, toNumber } from "@/lib/format";
import { useDebouncedValue } from "@/lib/hooks";
import type { DeviceSimulation, DeviceStats, Reading, Sensor, StorageUnit } from "@/lib/types";
import { TemperatureTrendChart } from "@/components/Charts";
import {
  Badge,
  Button,
  ConfirmDialog,
  CopyButton,
  EmptyState,
  ErrorState,
  Field,
  FilterBar,
  Input,
  Kpi,
  Modal,
  PageHeader,
  PageSkeleton,
  Pagination,
  Panel,
  SearchInput,
  SegmentedControl,
  Select,
  SimulatedBadge,
  TD,
  TH,
  TR,
  TableWrap,
} from "@/components/ui";

type DeviceForm = {
  deviceId: string;
  name: string;
  model: string;
  firmwareVersion: string;
  sensorType: string;
  storageUnitId: string;
  calibrationDueAt: string;
};

const EMPTY: DeviceForm = { deviceId: "", name: "", model: "", firmwareVersion: "", sensorType: "TEMPERATURE_HUMIDITY", storageUnitId: "", calibrationDueAt: "" };

function DeviceDialog({ open, onClose, onKey }: { open: boolean; onClose: () => void; onKey: (key: string) => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<DeviceForm>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const units = useQuery({ queryKey: ["storage-units", "options"], queryFn: () => api.page<StorageUnit>("/storage-units", { pageSize: 100 }), enabled: open });

  useEffect(() => { if (open) { setForm(EMPTY); setError(null); } }, [open]);

  const mutation = useMutation({
    mutationFn: () => api.post<{ sensor: Sensor; apiKey: string }>("/devices", {
      deviceId: form.deviceId.trim().toUpperCase(),
      name: form.name.trim(),
      model: form.model.trim() || null,
      firmwareVersion: form.firmwareVersion.trim() || null,
      sensorType: form.sensorType,
      storageUnitId: form.storageUnitId || null,
      calibrationDueAt: form.calibrationDueAt ? new Date(`${form.calibrationDueAt}T00:00:00.000Z`).toISOString() : null,
    }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["devices"] });
      onClose();
      onKey(result.apiKey);
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  return (
    <Modal open={open} onOpenChange={(value) => !value && onClose()} title="Register device" description="The API key is generated once and never returned again." size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={mutation.isPending} onClick={() => { setError(null); if (!form.deviceId.trim() || !form.name.trim()) return setError("Device ID and name are required."); mutation.mutate(); }}>Register device</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Device ID" required><Input value={form.deviceId} onChange={(e) => setForm({ ...form, deviceId: e.target.value })} placeholder="FGS-HYD-C2A" /></Field>
        <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Cold room 2 sensor" /></Field>
        <Field label="Model"><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="FrostGuard Sentinel T2" /></Field>
        <Field label="Firmware"><Input value={form.firmwareVersion} onChange={(e) => setForm({ ...form, firmwareVersion: e.target.value })} placeholder="2.4.1" /></Field>
        <Field label="Sensor type"><Select value={form.sensorType} onChange={(e) => setForm({ ...form, sensorType: e.target.value })}><option value="TEMPERATURE_HUMIDITY">Temperature &amp; humidity</option><option value="TEMPERATURE">Temperature</option></Select></Field>
        <Field label="Calibration due"><Input type="date" value={form.calibrationDueAt} onChange={(e) => setForm({ ...form, calibrationDueAt: e.target.value })} /></Field>
        <Field label="Assign to storage unit" className="sm:col-span-2"><Select value={form.storageUnitId} onChange={(e) => setForm({ ...form, storageUnitId: e.target.value })}><option value="">Unassigned</option>{(units.data?.data ?? []).map((unit) => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}</Select></Field>
      </div>
      {error ? <p className="mt-4 rounded-lg border border-rose/30 bg-rose/10 p-2 text-xs text-rose">{error}</p> : null}
    </Modal>
  );
}

function KeyDialog({ apiKey, title, onClose }: { apiKey: string | null; title: string; onClose: () => void }) {
  return (
    <Modal open={Boolean(apiKey)} onOpenChange={(value) => !value && onClose()} title={title} description="Copy this credential now. It is stored only as a hash and cannot be recovered." size="md"
      footer={<Button onClick={onClose}>I have stored the key</Button>}>
      <div className="rounded-xl border border-amber/30 bg-amber/5 p-3">
        <p className="text-[11px] text-amber">Shown once · handle as a secret</p>
        <div className="mt-2 flex items-start gap-2">
          <code className="min-w-0 flex-1 break-all rounded-lg bg-abyss p-2 font-mono text-[11px] text-ice">{apiKey}</code>
          <CopyButton value={apiKey ?? ""} />
        </div>
      </div>
    </Modal>
  );
}

type DeviceDetail = Sensor & {
  readings: Reading[];
  excursions: Array<{ id: string; severity: string; startedAt: string; status: string }>;
  simulations: DeviceSimulation[];
};

function DeviceDetailModal({ deviceId, onClose, onEdit, onRotate, onRevoke }: { deviceId: string | null; onClose: () => void; onEdit: (device: Sensor) => void; onRotate: (id: string) => void; onRevoke: (device: Sensor) => void }) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [scenario, setScenario] = useState<SimulationScenario>("STABLE");
  const [interval, setIntervalMs] = useState("3000");

  const query = useQuery({ queryKey: ["devices", deviceId], queryFn: () => api.get<DeviceDetail>(`/devices/${deviceId}`), enabled: Boolean(deviceId) });
  const device = query.data;
  const running = device?.simulations?.find((sim) => sim.status === "RUNNING");
  const canManage = hasPermission("device:manage");
  const canSimulate = hasPermission("telemetry:write");

  const mutation = useMutation({
    mutationFn: (action: "start" | "stop" | "reset") => {
      if (action === "start") return api.post<DeviceSimulation>(`/simulations/devices/${deviceId}/start`, { scenario, intervalMs: Number(interval) });
      return api.post<unknown>(`/simulations/devices/${deviceId}/${action}`);
    },
    onSuccess: (_result, action) => {
      toast.success(action === "start" ? "Simulation started" : action === "stop" ? "Simulation stopped" : "Simulation reset");
      void queryClient.invalidateQueries({ queryKey: ["devices"] });
      void queryClient.invalidateQueries({ queryKey: ["simulations"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const readings = (device?.readings ?? []).slice().reverse();

  return (
    <Modal open={Boolean(deviceId)} onOpenChange={(value) => !value && onClose()} title={device?.name ?? "Device"} description={device ? `${device.deviceId} · ${device.model ?? "Model not set"}` : "Loading device…"} size="lg">
      {query.isLoading ? <PageSkeleton /> : query.isError ? <ErrorState message={apiErrorMessage(query.error)} onRetry={() => void query.refetch()} /> : device ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(device.status)} dot>{humanize(device.status)}</Badge>
            <Badge tone="neutral">Key prefix {device.apiKeyPrefix ?? "—"}</Badge>
            <Badge tone={device.calibrationDueAt && new Date(device.calibrationDueAt) < new Date() ? "danger" : "success"}>
              {device.calibrationDueAt ? `Calibration ${fmtDateTime(device.calibrationDueAt)}` : "Calibration not scheduled"}
            </Badge>
            <div className="ml-auto flex gap-1">
              {canManage ? <Button variant="ghost" size="sm" icon={<Pencil className="size-3.5" aria-hidden />} onClick={() => { onClose(); onEdit(device); }}>Edit</Button> : null}
              {canManage ? <Button variant="ghost" size="sm" icon={<KeyRound className="size-3.5" aria-hidden />} onClick={() => onRotate(device.id)}>Rotate key</Button> : null}
              {canManage && device.status !== "REVOKED" ? <Button variant="ghost" size="sm" icon={<ShieldOff className="size-3.5" aria-hidden />} onClick={() => { onClose(); onRevoke(device); }}>Revoke</Button> : null}
            </div>
          </div>

          <div className="rounded-xl border border-line/60 bg-abyss/40 p-3">
            <p className="text-[10px] uppercase tracking-wider text-mist">Current assignment</p>
            {device.assignments?.find((assignment) => !assignment.endedAt) ? (
              <p className="mt-1 text-sm text-ice">
                {device.assignments.find((assignment) => !assignment.endedAt)?.storageUnit?.name ?? device.assignments.find((assignment) => !assignment.endedAt)?.shipment?.code ?? "—"}
              </p>
            ) : <p className="mt-1 text-xs text-mist">Not assigned</p>}
            <p className="mt-1 text-[10px] text-mist">Last seen {device.lastSeenAt ? fmtRelative(device.lastSeenAt) : "never"}</p>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-mist">Recent readings</p>
            <TemperatureTrendChart height={200} data={readings.map((reading) => ({ bucketStart: reading.recordedAt, avg: toNumber(reading.temperature) ?? 0 }))} />
            <p className="mt-2 text-[10px] text-mist">{readings.length} rows · simulated readings are labelled in lists and carry the database flag.</p>
          </div>

          <div className="rounded-xl border border-violet/25 bg-violet/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-ice"><Activity className="size-3.5 text-violet" aria-hidden /> Telemetry simulator</p>
                <p className="mt-0.5 text-[10px] text-mist">Generates explicitly simulated readings through the same ingestion path. Never real sensor data.</p>
              </div>
              {running ? <SimulatedBadge /> : null}
            </div>
            {running ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-mist">
                <span>Running <span className="font-mono text-ice">{running.scenario}</span> every {running.intervalMs} ms</span>
                <Button size="sm" variant="danger" loading={mutation.isPending} onClick={() => mutation.mutate("stop")}>Stop</Button>
                <Button size="sm" variant="secondary" loading={mutation.isPending} onClick={() => mutation.mutate("reset")}>Reset</Button>
              </div>
            ) : canSimulate ? (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <Field label="Scenario"><Select value={scenario} onChange={(e) => setScenario(e.target.value as SimulationScenario)}>{SIMULATION_SCENARIOS.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</Select></Field>
                <Field label="Interval"><Select value={interval} onChange={(e) => setIntervalMs(e.target.value)}>{[1000, 3000, 5000, 10000].map((ms) => <option key={ms} value={ms}>{ms / 1000}s</option>)}</Select></Field>
                <Button size="sm" loading={mutation.isPending} onClick={() => mutation.mutate("start")}>Start simulation</Button>
              </div>
            ) : <p className="mt-2 text-[10px] text-mist">Telemetry write permission required to simulate.</p>}
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-mist">Excursions</p>
            {(device.excursions ?? []).length === 0 ? <p className="text-xs text-mist">No excursions recorded.</p> : (
              <ul className="space-y-1.5 text-xs">
                {device.excursions.map((excursion) => <li key={excursion.id} className="flex items-center justify-between rounded-lg border border-line/50 px-2 py-1.5"><span className="text-mist">{fmtDateTime(excursion.startedAt)}</span><Badge tone={excursion.severity === "CRITICAL" ? "danger" : "warning"}>{excursion.severity}</Badge></li>)}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

export default function DevicesPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyTitle, setKeyTitle] = useState("Device API key");
  const [revoking, setRevoking] = useState<Sensor | null>(null);
  const debounced = useDebouncedValue(search);

  const stats = useQuery({ queryKey: ["devices", "stats"], queryFn: () => api.get<DeviceStats>("/devices/stats") });
  const query = useQuery({
    queryKey: ["devices", page, pageSize, debounced, status],
    queryFn: () => api.page<Sensor>("/devices", { page, pageSize, search: debounced || undefined, status: status || undefined }),
  });
  useEffect(() => setPage(1), [debounced, status, pageSize]);

  const rotate = useMutation({
    mutationFn: (id: string) => api.post<{ apiKey: string; prefix: string }>(`/devices/${id}/rotate-key`),
    onSuccess: (result) => { setKeyTitle("Rotated device API key"); setApiKey(result.apiKey); void queryClient.invalidateQueries({ queryKey: ["devices"] }); },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.post<Sensor>(`/devices/${id}/revoke`),
    onSuccess: () => { toast.success("Device revoked"); setRevoking(null); void queryClient.invalidateQueries({ queryKey: ["devices"] }); },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const rows = query.data?.data ?? [];
  const canManage = hasPermission("device:manage");

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Facilities" title="Devices & telemetry" description="Registered sensors, credential lifecycle, live readings and the transparent telemetry simulator." actions={canManage ? <Button onClick={() => setDialogOpen(true)}><Plus className="size-4" aria-hidden />Register device</Button> : null} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Online" value={stats.data?.online ?? "—"} tone="success" icon={<Radio className="size-4" aria-hidden />} />
        <Kpi label="Offline" value={stats.data?.offline ?? "—"} tone={(stats.data?.offline ?? 0) > 0 ? "warning" : "success"} icon={<WifiOff className="size-4" aria-hidden />} />
        <Kpi label="Maintenance" value={stats.data?.maintenance ?? "—"} tone="info" />
        <Kpi label="Calibration due" value={stats.data?.calibrationDue ?? "—"} tone={(stats.data?.calibrationDue ?? 0) > 0 ? "warning" : "success"} icon={<Thermometer className="size-4" aria-hidden />} />
        <Kpi label="Revoked" value={stats.data?.revoked ?? "—"} tone="neutral" icon={<ShieldOff className="size-4" aria-hidden />} />
      </section>

      <Panel>
        <FilterBar className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search device ID, name or model" className="min-w-[15rem] flex-1" />
          <SegmentedControl label="Status filter" value={status} onChange={setStatus} options={[{ value: "", label: "All" }, { value: "ONLINE", label: "Online" }, { value: "OFFLINE", label: "Offline" }, { value: "MAINTENANCE", label: "Maintenance" }, { value: "REVOKED", label: "Revoked" }]} />
          <Select value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Page size">{[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size} per page</option>)}</Select>
        </FilterBar>

        {query.isLoading ? <PageSkeleton /> : query.isError ? <ErrorState message={apiErrorMessage(query.error)} onRetry={() => void query.refetch()} /> : rows.length === 0 ? (
          <EmptyState title="No devices match" description="Register a sensor or adjust the filters." icon={<Search className="size-5" aria-hidden />} />
        ) : (
          <>
            <TableWrap>
              <thead><tr><TH>Device</TH><TH>Model</TH><TH>Assignment</TH><TH>Last reading</TH><TH>Calibration</TH><TH>Status</TH><TH className="text-right">Actions</TH></tr></thead>
              <tbody>
                {rows.map((device) => {
                  const latest = device.readings?.[0];
                  const assignment = device.assignments?.[0];
                  const days = daysUntil(device.calibrationDueAt);
                  return (
                    <TR key={device.id} className="cursor-pointer" onClick={() => setDetailId(device.id)}>
                      <TD><p className="text-xs font-medium text-ice">{device.name}</p><p className="font-mono text-[10px] text-cyan">{device.deviceId}</p></TD>
                      <TD><p className="text-xs">{device.model ?? "—"}</p><p className="text-[10px] text-mist">fw {device.firmwareVersion ?? "—"}</p></TD>
                      <TD className="text-xs">{assignment?.storageUnit?.name ?? assignment?.shipment?.code ?? "Unassigned"}</TD>
                      <TD><p className="stat-value text-xs">{latest ? fmtTemp(latest.temperature) : "—"}</p><p className="text-[10px] text-mist">{latest ? fmtRelative(latest.recordedAt) : "No readings"}</p>{latest?.isSimulated ? <SimulatedBadge /> : null}</TD>
                      <TD>{device.calibrationDueAt ? <Badge tone={days !== null && days < 0 ? "danger" : days !== null && days < 30 ? "warning" : "success"}>{days !== null && days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}</Badge> : "—"}</TD>
                      <TD><Badge tone={statusTone(device.status)} dot>{humanize(device.status)}</Badge></TD>
                      <TD><div className="flex justify-end">{canManage ? <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); rotate.mutate(device.id); }}>Rotate key</Button> : null}</div></TD>
                    </TR>
                  );
                })}
              </tbody>
            </TableWrap>
            <Pagination page={query.data?.page ?? 1} totalPages={query.data?.totalPages ?? 1} total={query.data?.total} onPage={setPage} />
          </>
        )}
      </Panel>

      <DeviceDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onKey={(key) => { setKeyTitle("New device API key"); setApiKey(key); }} />
      <KeyDialog apiKey={apiKey} title={keyTitle} onClose={() => setApiKey(null)} />
      <DeviceDetailModal deviceId={detailId} onClose={() => setDetailId(null)} onEdit={() => setDialogOpen(false)} onRotate={(id) => rotate.mutate(id)} onRevoke={setRevoking} />
      <ConfirmDialog open={Boolean(revoking)} onOpenChange={(value) => !value && setRevoking(null)} title="Revoke device" description={`${revoking?.name ?? "This device"} will lose access immediately. Historical readings remain for audit.`} confirmLabel="Revoke device" loading={revoke.isPending} onConfirm={() => revoking && revoke.mutate(revoking.id)} />
    </div>
  );
}
