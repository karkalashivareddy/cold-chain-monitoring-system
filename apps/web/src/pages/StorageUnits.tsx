import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { STORAGE_UNIT_STATUSES, STORAGE_UNIT_TYPES } from "@frostguard/shared";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDateTime, fmtRelative, fmtTemp, humanize, statusTone } from "@/lib/format";
import { useDebouncedValue } from "@/lib/hooks";
import type { StorageUnit, Warehouse } from "@/lib/types";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  FilterBar,
  Input,
  Modal,
  PageHeader,
  PageSkeleton,
  Pagination,
  Panel,
  PanelHeader,
  SearchInput,
  Select,
  SimulatedBadge,
  TD,
  TH,
  TR,
  TableWrap,
} from "@/components/ui";

type UnitForm = {
  warehouseId: string;
  code: string;
  name: string;
  type: string;
  capacityUnits: string;
  minTemp: string;
  maxTemp: string;
  status: string;
};

function emptyForm(warehouseId = ""): UnitForm {
  return { warehouseId, code: "", name: "", type: "COLD_ROOM", capacityUnits: "1000", minTemp: "2", maxTemp: "8", status: "OPERATIONAL" };
}

function StorageUnitDialog({ open, unit, warehouses, onClose }: { open: boolean; unit: StorageUnit | null; warehouses: Warehouse[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<UnitForm>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      unit
        ? {
            warehouseId: unit.warehouseId,
            code: unit.code,
            name: unit.name,
            type: unit.type,
            capacityUnits: String(unit.capacityUnits),
            minTemp: String(unit.minTemp),
            maxTemp: String(unit.maxTemp),
            status: unit.status,
          }
        : emptyForm(warehouses[0]?.id)
    );
  }, [open, unit, warehouses]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        warehouseId: form.warehouseId,
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        type: form.type,
        capacityUnits: Number(form.capacityUnits),
        minTemp: Number(form.minTemp),
        maxTemp: Number(form.maxTemp),
        status: form.status,
      };
      return unit ? api.patch<StorageUnit>(`/storage-units/${unit.id}`, payload) : api.post<StorageUnit>("/storage-units", payload);
    },
    onSuccess: () => {
      toast.success(unit ? "Storage unit updated" : "Storage unit created");
      void queryClient.invalidateQueries({ queryKey: ["storage-units"] });
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  function submit() {
    setError(null);
    if (!form.warehouseId) return setError("Select a warehouse.");
    if (!form.code.trim() || !form.name.trim()) return setError("Code and name are required.");
    if (Number(form.minTemp) >= Number(form.maxTemp)) return setError("Minimum temperature must be below maximum temperature.");
    if (Number(form.capacityUnits) < 1) return setError("Capacity must be at least 1.");
    mutation.mutate();
  }

  return (
    <Modal
      open={open}
      onOpenChange={(value) => !value && onClose()}
      title={unit ? `Edit ${unit.name}` : "New storage unit"}
      description="Temperature envelope is enforced by the excursion engine for assigned sensors."
      size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={mutation.isPending} onClick={submit}>{unit ? "Save changes" : "Create unit"}</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Warehouse" required className="sm:col-span-2">
          <Select value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}>
            <option value="">Select warehouse…</option>
            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code})</option>)}
          </Select>
        </Field>
        <Field label="Code" required><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CR-01" /></Field>
        <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Cold room 01" /></Field>
        <Field label="Type"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{STORAGE_UNIT_TYPES.map((type) => <option key={type} value={type}>{humanize(type)}</option>)}</Select></Field>
        <Field label="Capacity (units)"><Input type="number" min={1} value={form.capacityUnits} onChange={(e) => setForm({ ...form, capacityUnits: e.target.value })} /></Field>
        <Field label="Min °C"><Input type="number" step="0.1" value={form.minTemp} onChange={(e) => setForm({ ...form, minTemp: e.target.value })} /></Field>
        <Field label="Max °C"><Input type="number" step="0.1" value={form.maxTemp} onChange={(e) => setForm({ ...form, maxTemp: e.target.value })} /></Field>
        <Field label="Status"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STORAGE_UNIT_STATUSES.map((status) => <option key={status} value={status}>{humanize(status)}</option>)}</Select></Field>
      </div>
      {error ? <p className="mt-4 rounded-lg border border-rose/30 bg-rose/10 p-2 text-xs text-rose">{error}</p> : null}
    </Modal>
  );
}

function UnitDetail({ unitId, onClose, onEdit }: { unitId: string | null; onClose: () => void; onEdit: (unit: StorageUnit) => void }) {
  const { hasPermission } = useAuth();
  const unitQuery = useQuery({
    queryKey: ["storage-units", unitId],
    queryFn: () => api.get<StorageUnit & { batches?: Array<{ id: string; batchNumber: string; status: string; expiresAt: string; remainingQuantity: number; product?: { name: string } }> }>(`/storage-units/${unitId}`),
    enabled: Boolean(unitId),
  });
  const unit = unitQuery.data;

  return (
    <Modal open={Boolean(unitId)} onOpenChange={(value) => !value && onClose()} title={unit?.name ?? "Storage unit"} description={unit ? `${unit.code} · ${unit.warehouse?.name ?? ""}` : "Loading unit…"} size="lg">
      {unitQuery.isLoading ? <PageSkeleton /> : unitQuery.isError ? <ErrorState message={apiErrorMessage(unitQuery.error)} onRetry={() => void unitQuery.refetch()} /> : unit ? (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-line/60 bg-abyss/40 p-3"><p className="text-[10px] uppercase tracking-wider text-mist">Status</p><Badge tone={statusTone(unit.status)} dot className="mt-1">{humanize(unit.status)}</Badge></div>
            <div className="rounded-xl border border-line/60 bg-abyss/40 p-3"><p className="text-[10px] uppercase tracking-wider text-mist">Envelope</p><p className="stat-value mt-1 text-sm text-ice">{fmtTemp(unit.minTemp)} – {fmtTemp(unit.maxTemp)}</p></div>
            <div className="rounded-xl border border-line/60 bg-abyss/40 p-3"><p className="text-[10px] uppercase tracking-wider text-mist">Capacity</p><p className="stat-value mt-1 text-sm text-ice">{unit.capacityUnits} units</p></div>
          </div>

          <div>
            <PanelHeader title="Assigned sensors" description="Latest persisted reading per sensor; simulated provenance is labelled." action={hasPermission("warehouse:write") ? <Button variant="secondary" size="sm" onClick={() => onEdit(unit)}><Pencil className="size-3.5" aria-hidden />Edit unit</Button> : null} />
            {(unit.sensorAssignments ?? []).length === 0 ? <p className="text-xs text-mist">No sensors currently assigned.</p> : (
              <ul className="space-y-2">
                {(unit.sensorAssignments ?? []).map((assignment) => {
                  const sensor = assignment.sensor as unknown as { id: string; name: string; deviceId: string; status: string; lastSeenAt?: string | null; readings?: Array<{ temperature: string | number; recordedAt: string; isSimulated: boolean }> };
                  const latest = sensor.readings?.[0];
                  return (
                    <li key={sensor.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line/60 bg-abyss/40 p-2.5">
                      <div><p className="text-xs font-medium text-ice">{sensor.name}</p><p className="font-mono text-[10px] text-mist">{sensor.deviceId}</p></div>
                      <div className="text-right">
                        <p className="stat-value text-sm text-ice">{latest ? fmtTemp(latest.temperature) : "—"}</p>
                        <p className="text-[10px] text-mist">{latest ? fmtRelative(latest.recordedAt) : "No readings"}</p>
                      </div>
                      {latest?.isSimulated ? <SimulatedBadge /> : <Badge tone={statusTone(sensor.status)} dot>{humanize(sensor.status)}</Badge>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <PanelHeader title="Batches stored here" description="Active inventory in this unit." />
            {(unit.batches ?? []).length === 0 ? <p className="text-xs text-mist">No batches currently located here.</p> : (
              <TableWrap>
                <thead><tr><TH>Batch</TH><TH>Product</TH><TH>Remaining</TH><TH>Expires</TH><TH>Status</TH></tr></thead>
                <tbody>
                  {(unit.batches ?? []).map((batch) => (
                    <TR key={batch.id}><TD><Link to={`/app/batches/${batch.id}`} className="font-mono text-xs text-cyan hover:underline">{batch.batchNumber}</Link></TD><TD>{batch.product?.name ?? "—"}</TD><TD>{batch.remainingQuantity}</TD><TD>{fmtDateTime(batch.expiresAt)}</TD><TD><Badge tone={statusTone(batch.status)}>{humanize(batch.status)}</Badge></TD></TR>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <PanelHeader title="Excursions" />
              {(unit.excursions ?? []).length === 0 ? <p className="text-xs text-mist">No excursions recorded.</p> : (
                <ul className="space-y-1.5 text-xs">
                  {(unit.excursions ?? []).slice(0, 6).map((excursion) => (
                    <li key={excursion.id} className="flex items-center justify-between gap-2 rounded-lg border border-line/50 px-2 py-1.5"><span className="text-mist">{fmtDateTime(excursion.startedAt)}</span><Badge tone={excursion.severity === "CRITICAL" ? "danger" : "warning"}>{excursion.severity}</Badge></li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <PanelHeader title="Maintenance" />
              {(unit.maintenanceLogs ?? []).length === 0 ? <p className="text-xs text-mist">No maintenance logged.</p> : (
                <ul className="space-y-1.5 text-xs">
                  {(unit.maintenanceLogs ?? []).map((log) => (
                    <li key={log.id} className="rounded-lg border border-line/50 p-2"><p className="text-ice">{humanize(log.type)}</p><p className="text-[10px] text-mist">{fmtDateTime(log.performedAt)} · {log.performedBy}</p>{log.notes ? <p className="mt-0.5 text-[10px] text-mist/80">{log.notes}</p> : null}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

export default function StorageUnitsPage() {
  const { hasPermission } = useAuth();
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [warehouseId, setWarehouseId] = useState(searchParams.get("warehouseId") ?? "");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StorageUnit | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const debounced = useDebouncedValue(search);

  useEffect(() => {
    setWarehouseId(searchParams.get("warehouseId") ?? "");
  }, [searchParams]);

  const warehouses = useQuery({ queryKey: ["warehouses", "options"], queryFn: () => api.get<Warehouse[]>("/warehouses") });
  const query = useQuery({
    queryKey: ["storage-units", page, pageSize, debounced, warehouseId, type, status],
    queryFn: () => api.page<StorageUnit>("/storage-units", { page, pageSize, search: debounced || undefined, warehouseId: warehouseId || undefined, type: type || undefined, status: status || undefined }),
  });

  useEffect(() => setPage(1), [debounced, warehouseId, type, status, pageSize]);
  const rows = query.data?.data ?? [];
  const canWrite = hasPermission("warehouse:write");

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Facilities" title="Storage units" description="Cold rooms, fridges, freezers and ultra-low units with their live temperature envelope." actions={canWrite ? <Button onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="size-4" aria-hidden />New unit</Button> : null} />

      <Panel>
        <FilterBar className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search code or name" className="min-w-[13rem] flex-1" />
          <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} aria-label="Filter by warehouse"><option value="">All warehouses</option>{(warehouses.data ?? []).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</Select>
          <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type"><option value="">All types</option>{STORAGE_UNIT_TYPES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status"><option value="">All statuses</option>{STORAGE_UNIT_STATUSES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</Select>
          <Select value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Page size">{[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size} per page</option>)}</Select>
        </FilterBar>

        {query.isLoading ? <PageSkeleton /> : query.isError ? <ErrorState message={apiErrorMessage(query.error)} onRetry={() => void query.refetch()} /> : rows.length === 0 ? (
          <EmptyState title="No storage units match" description="Create a unit or adjust the filters." icon={<Search className="size-5" aria-hidden />} />
        ) : (
          <>
            <TableWrap>
              <thead><tr><TH>Unit</TH><TH>Warehouse</TH><TH>Type</TH><TH>Envelope</TH><TH>Capacity</TH><TH>Batches</TH><TH>Sensors</TH><TH>Status</TH></tr></thead>
              <tbody>
                {rows.map((unit) => (
                  <TR key={unit.id} className="cursor-pointer" onClick={() => setDetailId(unit.id)}>
                    <TD><p className="font-mono text-xs text-cyan">{unit.code}</p><p className="text-xs text-ice">{unit.name}</p></TD>
                    <TD><p className="text-xs text-ice">{unit.warehouse?.name ?? "—"}</p><p className="text-[10px] text-mist">{unit.warehouse?.city ?? ""}</p></TD>
                    <TD>{humanize(unit.type)}</TD>
                    <TD className="stat-value whitespace-nowrap">{fmtTemp(unit.minTemp)} – {fmtTemp(unit.maxTemp)}</TD>
                    <TD>{unit.capacityUnits}</TD>
                    <TD>{unit._count?.batches ?? 0}</TD>
                    <TD>{(unit.sensorAssignments ?? []).length}</TD>
                    <TD><Badge tone={statusTone(unit.status)} dot>{humanize(unit.status)}</Badge></TD>
                  </TR>
                ))}
              </tbody>
            </TableWrap>
            <Pagination page={query.data?.page ?? 1} totalPages={query.data?.totalPages ?? 1} total={query.data?.total} onPage={setPage} />
          </>
        )}
      </Panel>

      <StorageUnitDialog open={dialogOpen} unit={editing} warehouses={warehouses.data ?? []} onClose={() => setDialogOpen(false)} />
      <UnitDetail unitId={detailId} onClose={() => setDetailId(null)} onEdit={(unit) => { setDetailId(null); setEditing(unit); setDialogOpen(true); }} />
    </div>
  );
}
