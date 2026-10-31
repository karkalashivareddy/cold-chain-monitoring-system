import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Boxes, Package, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { api, apiErrorMessage, type PageResult } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtNumber, fmtTemp, humanize } from "@/lib/format";
import { useDebouncedValue } from "@/lib/hooks";
import type { Product } from "@/lib/types";
import { ProductDialog } from "@/components/catalog/ProductDialog";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FilterBar,
  Kpi,
  PageHeader,
  PageSkeleton,
  Pagination,
  Panel,
  SearchInput,
  SegmentedControl,
  Select,
  TD,
  TH,
  TR,
  TableWrap,
} from "@/components/ui";
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
                    <TD className="stat-value whitespace-nowrap">{fmtTemp(product.minTemp)} â€“ {fmtTemp(product.maxTemp)}</TD>
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

      <ProductDialog open={dialogOpen} onOpenChange={setDialogOpen} product={editing} categories={categories} />
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
