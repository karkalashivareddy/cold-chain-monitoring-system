import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Boxes, Package, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { STORAGE_UNIT_TYPES } from "@frostguard/shared";
import { api, apiErrorMessage, type PageResult } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtNumber, fmtTemp, humanize } from "@/lib/format";
import { useDebouncedValue } from "@/lib/hooks";
import type { Product } from "@/lib/types";
import {
  Badge,
  Button,
  ConfirmDialog,
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
  Switch,
  TD,
  TH,
  TR,
  TableWrap,
  Textarea,
} from "@/components/ui";

type ProductForm = {
  code: string;
  name: string;
  category: string;
  manufacturer: string;
  description: string;
  storageType: string;
  minTemp: string;
  maxTemp: string;
  isActive: boolean;
};

const EMPTY_FORM: ProductForm = {
  code: "",
  name: "",
  category: "",
  manufacturer: "",
  description: "",
  storageType: "FRIDGE",
  minTemp: "2",
  maxTemp: "8",
  isActive: true,
};

export function ProductDialog({
  open,
  product,
  onClose,
}: {
  open: boolean;
  product: Product | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      product
        ? {
            code: product.code,
            name: product.name,
            category: product.category,
            manufacturer: product.manufacturer ?? "",
            description: product.description ?? "",
            storageType: product.storageType,
            minTemp: String(product.minTemp),
            maxTemp: String(product.maxTemp),
            isActive: product.isActive,
          }
        : EMPTY_FORM
    );
  }, [open, product]);

  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      product ? api.patch<Product>(`/products/${product.id}`, payload) : api.post<Product>("/products", payload),
    onSuccess: () => {
      toast.success(product ? "Product updated" : "Product created");
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  function submit() {
    setError(null);
    if (!form.code.trim() || !form.name.trim() || !form.category.trim()) {
      setError("Code, name and category are required.");
      return;
    }
    const min = Number(form.minTemp);
    const max = Number(form.maxTemp);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      setError("Minimum temperature must be lower than maximum temperature.");
      return;
    }
    mutation.mutate({
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      category: form.category.trim(),
      manufacturer: form.manufacturer.trim() || null,
      description: form.description.trim() || null,
      storageType: form.storageType,
      minTemp: min,
      maxTemp: max,
      isActive: form.isActive,
    });
  }

  return (
    <Modal
      open={open}
      onOpenChange={(value) => !value && onClose()}
      title={product ? `Edit ${product.name}` : "New product"}
      description="Storage envelope applies to every batch unless a batch overrides its profile."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={mutation.isPending} onClick={submit}>
            {product ? "Save changes" : "Create product"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product code" required>
          <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="VAX-PF-04" />
        </Field>
        <Field label="Name" required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Pediatric vaccine" />
        </Field>
        <Field label="Category" required>
          <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Vaccine" />
        </Field>
        <Field label="Manufacturer">
          <Input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
        </Field>
        <Field label="Storage type">
          <Select value={form.storageType} onChange={(e) => setForm({ ...form, storageType: e.target.value })}>
            {STORAGE_UNIT_TYPES.map((type) => (
              <option key={type} value={type}>
                {humanize(type)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Min °C">
            <Input type="number" step="0.1" value={form.minTemp} onChange={(e) => setForm({ ...form, minTemp: e.target.value })} />
          </Field>
          <Field label="Max °C">
            <Input type="number" step="0.1" value={form.maxTemp} onChange={(e) => setForm({ ...form, maxTemp: e.target.value })} />
          </Field>
        </div>
        <Field label="Description" className="sm:col-span-2">
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Switch checked={form.isActive} onChange={(value) => setForm({ ...form, isActive: value })} label="Active product" />
        </div>
      </div>
      {error ? <p className="mt-4 rounded-lg border border-rose/30 bg-rose/10 p-2 text-xs text-rose">{error}</p> : null}
    </Modal>
  );
}

export default function ProductsPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [active, setActive] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [archiving, setArchiving] = useState<Product | null>(null);
  const debouncedSearch = useDebouncedValue(search);

  const query = useQuery({
    queryKey: ["products", page, pageSize, debouncedSearch, category, active],
    queryFn: () =>
      api.page<Product>("/products", {
        page,
        pageSize,
        search: debouncedSearch || undefined,
        category: category || undefined,
        active: active === "all" ? undefined : active === "active" ? "true" : "false",
      }),
  });

  useEffect(() => setPage(1), [debouncedSearch, category, active, pageSize]);

  const archive = useMutation({
    mutationFn: (product: Product) => api.delete<Product>(`/products/${product.id}`),
    onSuccess: () => {
      toast.success("Product archived");
      setArchiving(null);
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const canWrite = hasPermission("product:write");
  const data: PageResult<Product> | undefined = query.data;
  const rows = data?.data ?? [];
  const categories = [...new Set(rows.map((row) => row.category))].sort();
  const activeOnPage = rows.filter((row) => row.isActive).length;
  const batchesOnPage = rows.reduce((sum, row) => sum + (row._count?.batches ?? 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Catalogue"
        title="Products"
        description="Storage envelopes, manufacturers and the batches that depend on each product."
        actions={
          canWrite ? (
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden />
              New product
            </Button>
          ) : null
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Products" value={fmtNumber(data?.total ?? 0)} hint="Matching the current filters" tone="info" icon={<Package className="size-4" aria-hidden />} />
        <Kpi label="Active on this page" value={`${activeOnPage}/${rows.length}`} hint="Not a tenant-wide count" tone="success" />
        <Kpi label="Categories on page" value={fmtNumber(categories.length)} tone="neutral" />
        <Kpi label="Batches on page" value={fmtNumber(batchesOnPage)} hint="Across visible products" tone="violet" icon={<Boxes className="size-4" aria-hidden />} />
      </section>

      <Panel>
        <FilterBar className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search code, name or manufacturer" className="min-w-[15rem] flex-1" />
          <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <SegmentedControl
            label="Active filter"
            value={active}
            onChange={setActive}
            options={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "archived", label: "Archived" },
            ]}
          />
          <Select value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Page size">
            {[10, 20, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </Select>
        </FilterBar>

        {query.isLoading ? (
          <PageSkeleton />
        ) : query.isError ? (
          <ErrorState message={apiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No products match"
            description="Adjust the filters or register the first product in this organization."
            icon={<Search className="size-5" aria-hidden />}
            action={canWrite ? <Button size="sm" onClick={() => setDialogOpen(true)}>New product</Button> : null}
          />
        ) : (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <TH>Code</TH>
                  <TH>Product</TH>
                  <TH>Category</TH>
                  <TH>Storage</TH>
                  <TH>Envelope</TH>
                  <TH>Batches</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </tr>
              </thead>
              <tbody>
                {rows.map((product) => (
                  <TR key={product.id}>
                    <TD><span className="font-mono text-xs text-cyan">{product.code}</span></TD>
                    <TD>
                      <p className="font-medium text-ice">{product.name}</p>
                      <p className="text-[11px] text-mist">{product.manufacturer ?? "Manufacturer not set"}</p>
                    </TD>
                    <TD>{product.category}</TD>
                    <TD>{humanize(product.storageType)}</TD>
                    <TD className="stat-value whitespace-nowrap">{fmtTemp(product.minTemp)} – {fmtTemp(product.maxTemp)}</TD>
                    <TD>{product._count?.batches ?? 0}</TD>
                    <TD><Badge tone={product.isActive ? "success" : "neutral"} dot>{product.isActive ? "Active" : "Archived"}</Badge></TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        {canWrite ? (
                          <>
                            <Button variant="ghost" size="sm" icon={<Pencil className="size-3.5" aria-hidden />} onClick={() => { setEditing(product); setDialogOpen(true); }}>
                              Edit
                            </Button>
                            <Button variant="ghost" size="sm" icon={<Archive className="size-3.5" aria-hidden />} onClick={() => setArchiving(product)}>
                              Archive
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </TableWrap>
            <Pagination page={data?.page ?? 1} totalPages={data?.totalPages ?? 1} total={data?.total} onPage={setPage} />
          </>
        )}
      </Panel>

      <ProductDialog open={dialogOpen} product={editing} onClose={() => setDialogOpen(false)} />
      <ConfirmDialog
        open={Boolean(archiving)}
        onOpenChange={(value) => !value && setArchiving(null)}
        title="Archive product"
        description={`${archiving?.name ?? "This product"} will be marked inactive. Existing batches remain available for traceability.`}
        confirmLabel="Archive"
        loading={archive.isPending}
        onConfirm={() => archiving && archive.mutate(archiving)}
      />
    </div>
  );
}
