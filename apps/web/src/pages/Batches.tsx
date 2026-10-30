import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, CalendarClock, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { BATCH_STATUSES } from "@frostguard/shared";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { daysUntil, fmtDate, fmtNumber, fmtTemp, humanize, statusTone } from "@/lib/format";
import { useDebouncedValue } from "@/lib/hooks";
import type { Batch, Product, StorageUnit } from "@/lib/types";
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
  SegmentedControl,
  Select,
  TD,
  TH,
  TR,
  TableWrap,
} from "@/components/ui";

type BatchFormState = {
  productId: string;
  batchNumber: string;
  manufacturedAt: string;
  expiresAt: string;
  quantity: string;
  storageUnitId: string;
  status: string;
};

function defaultBatchForm(productId = "", storageUnitId = ""): BatchFormState {
  const today = new Date();
  const expiry = new Date(today.getTime() + 365 * 86_400_000);
  return {
    productId,
    batchNumber: "",
    manufacturedAt: today.toISOString().slice(0, 10),
    expiresAt: expiry.toISOString().slice(0, 10),
    quantity: "100",
    storageUnitId,
    status: "QUARANTINE",
  };
}

export function BatchDialog({
  open,
  batch,
  onClose,
}: {
  open: boolean;
  batch?: Batch | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BatchFormState>(defaultBatchForm());
  const [error, setError] = useState<string | null>(null);

  const products = useQuery({
    queryKey: ["products", "options"],
    queryFn: () => api.page<Product>("/products", { pageSize: 100, active: "true", sort: "name", order: "asc" }),
    enabled: open,
  });
  const units = useQuery({
    queryKey: ["storage-units", "options"],
    queryFn: () => api.page<StorageUnit>("/storage-units", { pageSize: 100 }),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      batch
        ? {
            productId: batch.productId,
            batchNumber: batch.batchNumber,
            manufacturedAt: batch.manufacturedAt.slice(0, 10),
            expiresAt: batch.expiresAt.slice(0, 10),
            quantity: String(batch.quantity),
            storageUnitId: batch.storageUnitId ?? "",
            status: batch.status,
          }
        : defaultBatchForm()
    );
  }, [open, batch]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        productId: form.productId,
        batchNumber: form.batchNumber.trim(),
        manufacturedAt: new Date(`${form.manufacturedAt}T00:00:00.000Z`).toISOString(),
        expiresAt: new Date(`${form.expiresAt}T00:00:00.000Z`).toISOString(),
        quantity: Number(form.quantity),
        storageUnitId: form.storageUnitId || null,
        status: form.status,
      };
      return batch ? api.patch<Batch>(`/batches/${batch.id}`, payload) : api.post<Batch>("/batches", payload);
    },
    onSuccess: () => {
      toast.success(batch ? "Batch updated" : "Batch registered");
      void queryClient.invalidateQueries({ queryKey: ["batches"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  function submit() {
    setError(null);
    if (!form.productId) return setError("Select a product.");
    if (!form.batchNumber.trim()) return setError("Batch number is required.");
    if (form.expiresAt <= form.manufacturedAt) return setError("Expiry must be after the manufacturing date.");
    if (!Number.isFinite(Number(form.quantity)) || Number(form.quantity) < 1) return setError("Quantity must be at least 1.");
    mutation.mutate();
  }

  return (
    <Modal
      open={open}
      onOpenChange={(value) => !value && onClose()}
      title={batch ? `Edit batch ${batch.batchNumber}` : "Register batch"}
      description="The product's temperature profile is inherited unless overridden by the API."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={mutation.isPending} onClick={submit}>{batch ? "Save changes" : "Register batch"}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product" required className="sm:col-span-2">
          <Select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} disabled={Boolean(batch)}>
            <option value="">Select a product…</option>
            {(products.data?.data ?? []).map((product) => (
              <option key={product.id} value={product.id}>
                {product.code} · {product.name} ({fmtTemp(product.minTemp)}–{fmtTemp(product.maxTemp)})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Batch number" required>
          <Input value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} placeholder="BN-2026-001" />
        </Field>
        <Field label="Quantity (units)" required>
          <Input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
        </Field>
        <Field label="Manufactured" required>
          <Input type="date" value={form.manufacturedAt} onChange={(e) => setForm({ ...form, manufacturedAt: e.target.value })} />
        </Field>
        <Field label="Expires" required>
          <Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
        </Field>
        <Field label="Storage unit">
          <Select value={form.storageUnitId} onChange={(e) => setForm({ ...form, storageUnitId: e.target.value })}>
            <option value="">Unassigned</option>
            {(units.data?.data ?? []).map((unit) => (
              <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {BATCH_STATUSES.map((status) => <option key={status} value={status}>{humanize(status)}</option>)}
          </Select>
        </Field>
      </div>
      {error ? <p className="mt-4 rounded-lg border border-rose/30 bg-rose/10 p-2 text-xs text-rose">{error}</p> : null}
    </Modal>
  );
}

export default function BatchesPage() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [productId, setProductId] = useState("");
  const [expiring, setExpiring] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(search);

  const products = useQuery({
    queryKey: ["products", "options"],
    queryFn: () => api.page<Product>("/products", { pageSize: 100, sort: "name", order: "asc" }),
  });

  const query = useQuery({
    queryKey: ["batches", page, pageSize, debouncedSearch, status, productId, expiring],
    queryFn: () =>
      api.page<Batch>("/batches", {
        page,
        pageSize,
        search: debouncedSearch || undefined,
        status: status || undefined,
        productId: productId || undefined,
        expiringDays: expiring === "all" ? undefined : Number(expiring),
      }),
  });

  useEffect(() => setPage(1), [debouncedSearch, status, productId, expiring, pageSize]);

  const rows = query.data?.data ?? [];
  const canWrite = hasPermission("batch:write");
  const expiringSoon = rows.filter((row) => {
    const days = daysUntil(row.expiresAt);
    return days !== null && days >= 0 && days <= 30;
  }).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Inventory"
        title="Batches"
        description="Stock, storage location, expiry exposure and traceability for every registered batch."
        actions={canWrite ? <Button onClick={() => setDialogOpen(true)}><Plus className="size-4" aria-hidden />New batch</Button> : null}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Batches" value={fmtNumber(query.data?.total ?? 0)} hint="Matching filters" tone="info" icon={<Boxes className="size-4" aria-hidden />} />
        <Kpi label="Expiring ≤30d" value={fmtNumber(expiringSoon)} hint="On this page" tone={expiringSoon ? "warning" : "success"} icon={<CalendarClock className="size-4" aria-hidden />} />
        <Kpi label="Units remaining" value={fmtNumber(rows.reduce((sum, row) => sum + row.remainingQuantity, 0))} hint="On this page" />
        <Kpi label="Quarantined" value={fmtNumber(rows.filter((row) => row.status === "QUARANTINE").length)} hint="On this page" tone="warning" />
      </section>

      <Panel>
        <FilterBar className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search batch number or product" className="min-w-[14rem] flex-1" />
          <Select value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="Filter by product">
            <option value="">All products</option>
            {(products.data?.data ?? []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            {BATCH_STATUSES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
          </Select>
          <SegmentedControl
            label="Expiry window"
            value={expiring}
            onChange={setExpiring}
            options={[{ value: "all", label: "Any" }, { value: "30", label: "30d" }, { value: "60", label: "60d" }, { value: "90", label: "90d" }]}
          />
          <Select value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Page size">
            {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size} per page</option>)}
          </Select>
        </FilterBar>

        {query.isLoading ? <PageSkeleton /> : query.isError ? (
          <ErrorState message={apiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No batches match" description="Register a batch or adjust the filters." icon={<Search className="size-5" aria-hidden />} action={canWrite ? <Button size="sm" onClick={() => setDialogOpen(true)}>New batch</Button> : null} />
        ) : (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <TH>Batch</TH>
                  <TH>Product</TH>
                  <TH>Stock</TH>
                  <TH>Storage</TH>
                  <TH>Expiry</TH>
                  <TH>Status</TH>
                </tr>
              </thead>
              <tbody>
                {rows.map((batch) => {
                  const days = daysUntil(batch.expiresAt);
                  const expiryTone = days === null ? "neutral" : days < 0 ? "danger" : days <= 30 ? "warning" : days <= 90 ? "info" : "success";
                  const used = batch.quantity > 0 ? ((batch.quantity - batch.remainingQuantity) / batch.quantity) * 100 : 0;
                  return (
                    <TR key={batch.id} className="cursor-pointer" onClick={() => navigate(`/app/batches/${batch.id}`)}>
                      <TD><Link to={`/app/batches/${batch.id}`} className="font-mono text-xs text-cyan hover:underline" onClick={(e) => e.stopPropagation()}>{batch.batchNumber}</Link></TD>
                      <TD>
                        <p className="text-sm text-ice">{batch.product?.name ?? "—"}</p>
                        <p className="font-mono text-[10px] text-mist">{batch.product?.code}</p>
                      </TD>
                      <TD className="min-w-[9rem]">
                        <div className="flex items-center justify-between text-[11px]"><span className="stat-value">{batch.remainingQuantity}</span><span className="text-mist">/ {batch.quantity}</span></div>
                        <ProgressBar value={used} tone={used > 80 ? "warning" : "info"} label={`${batch.batchNumber} consumed`} className="mt-1.5" />
                      </TD>
                      <TD>
                        <p className="text-sm text-ice">{batch.storageUnit?.name ?? "Unassigned"}</p>
                        <p className="text-[10px] text-mist">{batch.storageUnit?.warehouse?.name ?? "—"}</p>
                      </TD>
                      <TD>
                        <p className="text-xs text-ice">{fmtDate(batch.expiresAt)}</p>
                        <Badge tone={expiryTone}>{days === null ? "—" : days < 0 ? `${Math.abs(days)}d expired` : `${days}d left`}</Badge>
                      </TD>
                      <TD><Badge tone={statusTone(batch.status)} dot>{humanize(batch.status)}</Badge></TD>
                    </TR>
                  );
                })}
              </tbody>
            </TableWrap>
            <Pagination page={query.data?.page ?? 1} totalPages={query.data?.totalPages ?? 1} total={query.data?.total} onPage={setPage} />
          </>
        )}
      </Panel>

      <BatchDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
