import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, MapPin, Pencil, Plus, Thermometer } from "lucide-react";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtTemp, toNumber } from "@/lib/format";
import { useDebouncedValue } from "@/lib/hooks";
import type { Warehouse } from "@/lib/types";
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
  Panel,
  SearchInput,
  Switch,
} from "@/components/ui";

type WarehouseForm = {
  code: string;
  name: string;
  addressLine: string;
  city: string;
  country: string;
  latitude: string;
  longitude: string;
  isActive: boolean;
};

const EMPTY: WarehouseForm = {
  code: "",
  name: "",
  addressLine: "",
  city: "",
  country: "",
  latitude: "",
  longitude: "",
  isActive: true,
};

function WarehouseDialog({ open, warehouse, onClose }: { open: boolean; warehouse: Warehouse | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<WarehouseForm>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      warehouse
        ? {
            code: warehouse.code,
            name: warehouse.name,
            addressLine: warehouse.addressLine ?? "",
            city: warehouse.city ?? "",
            country: warehouse.country ?? "",
            latitude: warehouse.latitude != null ? String(warehouse.latitude) : "",
            longitude: warehouse.longitude != null ? String(warehouse.longitude) : "",
            isActive: warehouse.isActive,
          }
        : EMPTY
    );
  }, [open, warehouse]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        addressLine: form.addressLine.trim() || null,
        city: form.city.trim() || null,
        country: form.country.trim() || null,
        latitude: form.latitude === "" ? null : Number(form.latitude),
        longitude: form.longitude === "" ? null : Number(form.longitude),
        isActive: form.isActive,
      };
      return warehouse ? api.patch<Warehouse>(`/warehouses/${warehouse.id}`, payload) : api.post<Warehouse>("/warehouses", payload);
    },
    onSuccess: () => {
      toast.success(warehouse ? "Warehouse updated" : "Warehouse created");
      void queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  function submit() {
    setError(null);
    if (!form.code.trim() || !form.name.trim()) return setError("Code and name are required.");
    if (form.latitude !== "" && (Number(form.latitude) < -90 || Number(form.latitude) > 90)) return setError("Latitude must be between -90 and 90.");
    if (form.longitude !== "" && (Number(form.longitude) < -180 || Number(form.longitude) > 180)) return setError("Longitude must be between -180 and 180.");
    mutation.mutate();
  }

  return (
    <Modal
      open={open}
      onOpenChange={(value) => !value && onClose()}
      title={warehouse ? `Edit ${warehouse.name}` : "New warehouse"}
      description="Coordinates are required before shipments can originate from this site."
      size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={mutation.isPending} onClick={submit}>{warehouse ? "Save changes" : "Create warehouse"}</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Code" required><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="WH-BLR" /></Field>
        <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Bengaluru distribution hub" /></Field>
        <Field label="Address" className="sm:col-span-2"><Input value={form.addressLine} onChange={(e) => setForm({ ...form, addressLine: e.target.value })} /></Field>
        <Field label="City"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
        <Field label="Country"><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></Field>
        <Field label="Latitude" hint="-90 to 90"><Input type="number" step="0.000001" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} /></Field>
        <Field label="Longitude" hint="-180 to 180"><Input type="number" step="0.000001" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Switch checked={form.isActive} onChange={(value) => setForm({ ...form, isActive: value })} label="Operational site" /></div>
      </div>
      {error ? <p className="mt-4 rounded-lg border border-rose/30 bg-rose/10 p-2 text-xs text-rose">{error}</p> : null}
    </Modal>
  );
}

export default function WarehousesPage() {
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const debounced = useDebouncedValue(search);
  const canWrite = hasPermission("warehouse:write");

  const query = useQuery({
    queryKey: ["warehouses", debounced],
    queryFn: () => api.get<Warehouse[]>("/warehouses", { search: debounced || undefined }),
  });

  const rows = query.data ?? [];
  const units = rows.reduce((sum, row) => sum + (row._count?.storageUnits ?? row.storageUnits?.length ?? 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Facilities"
        title="Warehouse network"
        description="Physical sites, their cold storage footprint and shipment origins."
        actions={canWrite ? <Button onClick={() => { setEditing(null); setDialogOpen(true); }}><Plus className="size-4" aria-hidden />New warehouse</Button> : null}
      />

      <Panel>
        <FilterBar className="mb-5">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, code or city" className="max-w-md flex-1" />
          <Badge tone="info">{rows.length} sites</Badge>
          <Badge tone="neutral">{units} storage units</Badge>
        </FilterBar>

        {query.isLoading ? <PageSkeleton /> : query.isError ? (
          <ErrorState message={apiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No warehouses" description="Add the first physical site to begin organising storage units." icon={<Building2 className="size-5" aria-hidden />} action={canWrite ? <Button size="sm" onClick={() => setDialogOpen(true)}>New warehouse</Button> : null} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {rows.map((warehouse) => (
              <article key={warehouse.id} className="panel-soft panel-interactive flex flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-cyan">{warehouse.code}</span>
                      <Badge tone={warehouse.isActive ? "success" : "neutral"} dot>{warehouse.isActive ? "Operational" : "Inactive"}</Badge>
                    </div>
                    <h2 className="mt-1 truncate text-sm font-semibold text-ice">{warehouse.name}</h2>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-mist"><MapPin className="size-3" aria-hidden />{[warehouse.city, warehouse.country].filter(Boolean).join(", ") || "Location not set"}</p>
                  </div>
                  {canWrite ? <Button variant="ghost" size="sm" icon={<Pencil className="size-3.5" aria-hidden />} onClick={() => { setEditing(warehouse); setDialogOpen(true); }} aria-label={`Edit ${warehouse.name}`} /> : null}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[10px] text-mist">
                  <div className="rounded-lg bg-white/[0.03] py-2"><p className="stat-value text-base text-ice">{warehouse._count?.storageUnits ?? warehouse.storageUnits?.length ?? 0}</p>units</div>
                  <div className="rounded-lg bg-white/[0.03] py-2"><p className="stat-value text-base text-ice">{warehouse._count?.shipmentsAsOrigin ?? 0}</p>shipments</div>
                </div>

                <div className="mt-3 flex-1 space-y-1.5">
                  {(warehouse.storageUnits ?? []).slice(0, 4).map((unit) => (
                    <div key={unit.id} className="flex items-center justify-between gap-2 rounded-lg border border-line/50 px-2 py-1.5 text-[11px]">
                      <span className="flex min-w-0 items-center gap-1.5"><Thermometer className="size-3 shrink-0 text-teal" aria-hidden /><span className="truncate text-ice">{unit.name}</span></span>
                      <span className="stat-value shrink-0 text-mist">{fmtTemp(unit.minTemp, 0)}–{fmtTemp(unit.maxTemp, 0)}</span>
                    </div>
                  ))}
                  {(warehouse.storageUnits?.length ?? 0) === 0 ? <p className="text-[11px] text-mist">No storage units registered.</p> : null}
                  {(warehouse.storageUnits?.length ?? 0) > 4 ? <p className="text-[10px] text-mist">+{(warehouse.storageUnits?.length ?? 0) - 4} more units</p> : null}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-line/40 pt-3">
                  <Link to={`/app/storage-units?warehouseId=${warehouse.id}`} className="text-[11px] text-cyan hover:underline">View storage units</Link>
                  <span className="text-[10px] text-mist">{warehouse.latitude != null && warehouse.longitude != null ? `${toNumber(warehouse.latitude)?.toFixed(2)}, ${toNumber(warehouse.longitude)?.toFixed(2)}` : "No coordinates"}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <WarehouseDialog open={dialogOpen} warehouse={editing} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
