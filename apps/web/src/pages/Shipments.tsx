import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, MapPin, PackageCheck, Plus, Search, ShieldAlert, Truck } from "lucide-react";
import { toast } from "sonner";
import { SHIPMENT_STATUSES } from "@frostguard/shared";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDateTime, fmtNumber, fmtPercent, fmtRelative, fmtTemp, humanize, riskTone, statusTone } from "@/lib/format";
import { useDebouncedValue } from "@/lib/hooks";
import type { Batch, Shipment, Warehouse } from "@/lib/types";
import {
  Badge,
  Button,
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
  ProgressBar,
  SearchInput,
  Select,
  TD,
  TH,
  TR,
  TableWrap,
  Textarea,
} from "@/components/ui";

const DESTINATIONS: Array<{ name: string; city: string; lat: number; lng: number }> = [
  { name: "St. Mary's Medical Center", city: "Mumbai", lat: 19.07609, lng: 72.877701 },
  { name: "Apollo Research Hospital", city: "Chennai", lat: 13.060422, lng: 80.249583 },
  { name: "Chennai Central Hospital", city: "Chennai", lat: 13.08268, lng: 80.270718 },
  { name: "Pune Children's Hospital", city: "Pune", lat: 18.52043, lng: 73.856744 },
  { name: "Vijayawada Cancer Centre", city: "Vijayawada", lat: 16.506174, lng: 80.648015 },
  { name: "Mysuru District Hospital", city: "Mysuru", lat: 12.29581, lng: 76.63938 },
  { name: "Hyderabad Central Pharmacy", city: "Hyderabad", lat: 17.385044, lng: 78.486671 },
  { name: "Bengaluru Distribution Clinic", city: "Bengaluru", lat: 12.971599, lng: 77.594566 },
  { name: "Delhi AIIMS Cold Receiving", city: "New Delhi", lat: 28.5672, lng: 77.2100 },
  { name: "Kolkata Medical Logistics Hub", city: "Kolkata", lat: 22.572645, lng: 88.363892 },
];

type ItemRow = { key: string; batchId: string; quantity: string };

type ShipmentForm = {
  originWarehouseId: string;
  destinationName: string;
  destinationCity: string;
  destinationLat: string;
  destinationLng: string;
  plannedDepartureAt: string;
  estimatedArrivalAt: string;
  notes: string;
  items: ItemRow[];
};

function localInput(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function emptyForm(warehouseId = ""): ShipmentForm {
  return {
    originWarehouseId: warehouseId,
    destinationName: "",
    destinationCity: "",
    destinationLat: "",
    destinationLng: "",
    plannedDepartureAt: localInput(new Date(Date.now() + 24 * 3_600_000)),
    estimatedArrivalAt: localInput(new Date(Date.now() + 42 * 3_600_000)),
    notes: "",
    items: [{ key: crypto.randomUUID(), batchId: "", quantity: "" }],
  };
}

function ShipmentDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (shipment: Shipment) => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ShipmentForm>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  const warehouses = useQuery({
    queryKey: ["warehouses", "options"],
    queryFn: () => api.get<Warehouse[]>("/warehouses"),
    enabled: open,
  });
  const batches = useQuery({
    queryKey: ["batches", "shipment-options"],
    queryFn: () => api.page<Batch>("/batches", { pageSize: 100, status: "AVAILABLE" }),
    enabled: open,
  });

  const originOptions = useMemo(
    () => (warehouses.data ?? []).filter((warehouse) => warehouse.latitude != null && warehouse.longitude != null),
    [warehouses.data]
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(emptyForm());
  }, [open]);

  const batchRows = batches.data?.data ?? [];
  useEffect(() => {
    if (!open || form.originWarehouseId || !originOptions[0]) return;
    setForm((current) => ({ ...current, originWarehouseId: originOptions[0]!.id }));
  }, [form.originWarehouseId, open, originOptions]);

  const mutation = useMutation({
    mutationFn: () => {
      const items = form.items
        .filter((item) => item.batchId)
        .map((item) => ({ batchId: item.batchId, quantity: Number(item.quantity) }));
      return api.post<Shipment>("/shipments", {
        originWarehouseId: form.originWarehouseId,
        destinationName: form.destinationName.trim(),
        destinationCity: form.destinationCity.trim() || null,
        destinationLat: Number(form.destinationLat),
        destinationLng: Number(form.destinationLng),
        plannedDepartureAt: form.plannedDepartureAt ? new Date(form.plannedDepartureAt).toISOString() : null,
        estimatedArrivalAt: form.estimatedArrivalAt ? new Date(form.estimatedArrivalAt).toISOString() : null,
        notes: form.notes.trim() || null,
        items,
      });
    },
    onSuccess: (shipment) => {
      toast.success(`Shipment ${shipment.code} planned`);
      void queryClient.invalidateQueries({ queryKey: ["shipments"] });
      void queryClient.invalidateQueries({ queryKey: ["batches"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
      onCreated(shipment);
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  function updateItem(key: string, patch: Partial<ItemRow>) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    }));
  }

  function submit() {
    setError(null);
    if (!form.originWarehouseId) return setError("Select an origin warehouse with coordinates.");
    if (form.destinationName.trim().length < 2) return setError("Destination name is required.");
    const lat = Number(form.destinationLat);
    const lng = Number(form.destinationLng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return setError("Destination latitude must be between -90 and 90.");
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return setError("Destination longitude must be between -180 and 180.");
    const selected = form.items.filter((item) => item.batchId);
    if (selected.length === 0) return setError("Add at least one batch to the shipment.");
    if (new Set(selected.map((item) => item.batchId)).size !== selected.length) return setError("Each batch can only appear once.");
    for (const item of selected) {
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) return setError("Every batch quantity must be a whole number of at least 1.");
      const batch = batchRows.find((row) => row.id === item.batchId);
      if (batch && quantity > batch.remainingQuantity) {
        return setError(`${batch.batchNumber} only has ${batch.remainingQuantity} units available.`);
      }
    }
    if (form.plannedDepartureAt && form.estimatedArrivalAt && new Date(form.estimatedArrivalAt) <= new Date(form.plannedDepartureAt)) {
      return setError("Estimated arrival must be after the planned departure.");
    }
    mutation.mutate();
  }

  const totalUnits = form.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  return (
    <Modal
      open={open}
      onOpenChange={(value) => !value && onClose()}
      title="Plan shipment"
      description="Stock is reserved atomically at dispatch, not at planning. Seeded batches show their remaining quantity."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={mutation.isPending} onClick={submit}>Plan shipment</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Origin warehouse" required className="sm:col-span-2">
            <Select value={form.originWarehouseId} onChange={(e) => setForm({ ...form, originWarehouseId: e.target.value })}>
              <option value="">Select a warehouse…</option>
              {originOptions.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name} · {warehouse.city ?? "coordinates set"}
                </option>
              ))}
            </Select>
            {originOptions.length === 0 && !warehouses.isLoading ? (
              <p className="text-xs text-amber">No warehouse has coordinates yet. Add coordinates before planning a shipment.</p>
            ) : null}
          </Field>

          <Field label="Destination preset" hint="Fills the fields below with real coordinates.">
            <Select
              value=""
              onChange={(e) => {
                const preset = DESTINATIONS.find((item) => item.name === e.target.value);
                if (!preset) return;
                setForm({
                  ...form,
                  destinationName: preset.name,
                  destinationCity: preset.city,
                  destinationLat: String(preset.lat),
                  destinationLng: String(preset.lng),
                });
              }}
            >
              <option value="">Choose a destination…</option>
              {DESTINATIONS.map((preset) => (
                <option key={preset.name} value={preset.name}>{preset.name} ({preset.city})</option>
              ))}
            </Select>
          </Field>
          <Field label="Destination city">
            <Input value={form.destinationCity} onChange={(e) => setForm({ ...form, destinationCity: e.target.value })} placeholder="Chennai" />
          </Field>
          <Field label="Destination name" required className="sm:col-span-2">
            <Input value={form.destinationName} onChange={(e) => setForm({ ...form, destinationName: e.target.value })} placeholder="Apollo Research Hospital" />
          </Field>
          <Field label="Latitude" required><Input type="number" step="0.000001" value={form.destinationLat} onChange={(e) => setForm({ ...form, destinationLat: e.target.value })} placeholder="13.060422" /></Field>
          <Field label="Longitude" required><Input type="number" step="0.000001" value={form.destinationLng} onChange={(e) => setForm({ ...form, destinationLng: e.target.value })} placeholder="80.249583" /></Field>
          <Field label="Planned departure"><Input type="datetime-local" value={form.plannedDepartureAt} onChange={(e) => setForm({ ...form, plannedDepartureAt: e.target.value })} /></Field>
          <Field label="Estimated arrival"><Input type="datetime-local" value={form.estimatedArrivalAt} onChange={(e) => setForm({ ...form, estimatedArrivalAt: e.target.value })} /></Field>
        </div>

        <div className="rounded-xl border border-line/70 bg-abyss/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-ice">Cargo · {totalUnits} units</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setForm({ ...form, items: [...form.items, { key: crypto.randomUUID(), batchId: "", quantity: "" }] })}
            >
              <Plus className="size-3.5" aria-hidden /> Add batch
            </Button>
          </div>
          <div className="space-y-2">
            {form.items.map((item, index) => {
              const batch = batchRows.find((row) => row.id === item.batchId);
              return (
                <div key={item.key} className="grid gap-2 sm:grid-cols-[1fr_7rem_auto]">
                  <Field label={index === 0 ? "Batch" : `Batch ${index + 1}`}>
                    <Select
                      value={item.batchId}
                      onChange={(e) => updateItem(item.key, { batchId: e.target.value })}
                    >
                      <option value="">Select batch…</option>
                      {batchRows.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.batchNumber} · {row.product?.name ?? "Product"} · {row.remainingQuantity} left
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Quantity" hint={batch ? `${fmtTemp(batch.product?.minTemp)}–${fmtTemp(batch.product?.maxTemp)}` : undefined}>
                    <Input
                      type="number"
                      min={1}
                      max={batch?.remainingQuantity}
                      value={item.quantity}
                      onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                      placeholder={batch ? String(batch.remainingQuantity) : "0"}
                    />
                  </Field>
                  <div className="flex items-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={form.items.length === 1}
                      onClick={() => setForm({ ...form, items: form.items.filter((row) => row.key !== item.key) })}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          {batchRows.length === 0 && !batches.isLoading ? (
            <p className="mt-2 text-xs text-amber">No available batches. Register stock before planning a shipment.</p>
          ) : null}
        </div>

        <Field label="Notes">
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Handling instructions, receiving contact, priority…" />
        </Field>
      </div>
      {error ? <p className="mt-4 rounded-lg border border-rose/30 bg-rose/10 p-2 text-xs text-rose" role="alert">{error}</p> : null}
    </Modal>
  );
}

export default function ShipmentsPage() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const debounced = useDebouncedValue(search);

  const query = useQuery({
    queryKey: ["shipments", page, pageSize, debounced, status],
    queryFn: () => api.page<Shipment>("/shipments", { page, pageSize, search: debounced || undefined, status: status || undefined }),
  });

  useEffect(() => setPage(1), [debounced, status, pageSize]);

  const rows = (query.data?.data ?? []) as Array<Shipment & { excursions?: Array<{ id: string; severity: string }> }>;
  const canWrite = hasPermission("shipment:write");
  const activeOnPage = rows.filter((row) => ["DISPATCHED", "IN_TRANSIT", "DELAYED"].includes(row.status)).length;
  const atRiskOnPage = rows.filter((row) => row.riskScore >= 60).length;
  const openExcursions = rows.reduce((sum, row) => sum + (row.excursions?.length ?? 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Command"
        title="Shipments"
        description="Plan, dispatch and follow every temperature-controlled movement from warehouse to receiving site."
        actions={
          <>
            <Link to="/app/map">
              <Button variant="secondary" size="sm"><MapPin className="size-3.5" aria-hidden /> Live fleet map</Button>
            </Link>
            {canWrite ? (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="size-4" aria-hidden /> Plan shipment
              </Button>
            ) : null}
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Shipments" value={fmtNumber(query.data?.total ?? 0)} hint="Matching the current filters" tone="info" icon={<Truck className="size-4" aria-hidden />} />
        <Kpi label="In motion" value={fmtNumber(activeOnPage)} hint="On this page" tone={activeOnPage ? "success" : "neutral"} icon={<PackageCheck className="size-4" aria-hidden />} />
        <Kpi label="Elevated risk" value={fmtNumber(atRiskOnPage)} hint="Risk score ≥ 60 on this page" tone={atRiskOnPage ? "danger" : "success"} icon={<ShieldAlert className="size-4" aria-hidden />} />
        <Kpi label="Open excursions" value={fmtNumber(openExcursions)} hint="On this page" tone={openExcursions ? "warning" : "success"} />
      </section>

      <Panel>
        <FilterBar className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search code, destination or city" className="min-w-[15rem] flex-1" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            {SHIPMENT_STATUSES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
          </Select>
          <Select value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Page size">
            {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size} per page</option>)}
          </Select>
        </FilterBar>

        {query.isLoading ? <PageSkeleton /> : query.isError ? (
          <ErrorState message={apiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No shipments match" description="Plan a movement or adjust the filters." icon={<Search className="size-5" aria-hidden />} action={canWrite ? <Button size="sm" onClick={() => setDialogOpen(true)}>Plan shipment</Button> : null} />
        ) : (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <TH>Shipment</TH>
                  <TH>Route</TH>
                  <TH>Vehicle / driver</TH>
                  <TH>Progress</TH>
                  <TH>Risk</TH>
                  <TH>Arrival</TH>
                  <TH>Status</TH>
                  <TH aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {rows.map((shipment) => {
                  const tone = riskTone(shipment.riskScore);
                  const late = shipment.estimatedArrivalAt ? new Date(shipment.estimatedArrivalAt).getTime() < Date.now() && shipment.status !== "DELIVERED" : false;
                  return (
                    <TR key={shipment.id} className="cursor-pointer" onClick={() => navigate(`/app/shipments/${shipment.id}`)}>
                      <TD>
                        <Link to={`/app/shipments/${shipment.id}`} className="font-mono text-xs text-cyan hover:underline" onClick={(event) => event.stopPropagation()}>
                          {shipment.code}
                        </Link>
                        <p className="mt-0.5 text-[10px] text-mist">{shipment._count?.items ?? 0} batch lines</p>
                      </TD>
                      <TD className="min-w-[13rem]">
                        <p className="text-xs text-ice">{shipment.originWarehouse?.name ?? "Origin"}</p>
                        <p className="flex items-center gap-1 text-[11px] text-mist"><span aria-hidden>→</span> {shipment.destinationName}</p>
                        <p className="text-[10px] text-mist/70">{shipment.destinationCity ?? "City not set"}</p>
                      </TD>
                      <TD>
                        <p className="text-xs text-ice">{shipment.vehicle?.plateNumber ?? "No vehicle"}</p>
                        <p className="text-[10px] text-mist">{shipment.driver?.fullName ?? "No driver assigned"}</p>
                      </TD>
                      <TD className="min-w-[8rem]">
                        <div className="flex items-center justify-between text-[11px] text-mist"><span>{fmtPercent(shipment.progressPercent)}</span></div>
                        <ProgressBar value={shipment.progressPercent} tone={shipment.status === "DELAYED" ? "warning" : "info"} label={`${shipment.code} progress`} className="mt-1.5" />
                      </TD>
                      <TD>
                        <Badge tone={tone} dot>Risk {shipment.riskScore}</Badge>
                        <p className="mt-1 text-[10px] text-mist">{shipment.excursions?.length ? `${shipment.excursions.length} open` : "No open excursion"}</p>
                      </TD>
                      <TD>
                        <p className="text-xs text-ice">{shipment.estimatedArrivalAt ? fmtDateTime(shipment.estimatedArrivalAt) : "Not set"}</p>
                        <p className={`text-[10px] ${late ? "text-amber" : "text-mist"}`}>{shipment.estimatedArrivalAt ? (late ? "Past estimate" : fmtRelative(shipment.estimatedArrivalAt)) : "—"}</p>
                      </TD>
                      <TD><Badge tone={statusTone(shipment.status)} dot>{humanize(shipment.status)}</Badge></TD>
                      <TD><ArrowUpRight className="size-3.5 text-mist" aria-hidden /></TD>
                    </TR>
                  );
                })}
              </tbody>
            </TableWrap>
            <Pagination page={query.data?.page ?? 1} totalPages={query.data?.totalPages ?? 1} total={query.data?.total} onPage={setPage} />
          </>
        )}
      </Panel>

      <ShipmentDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onCreated={(shipment) => navigate(`/app/shipments/${shipment.id}`)} />
    </div>
  );
}
