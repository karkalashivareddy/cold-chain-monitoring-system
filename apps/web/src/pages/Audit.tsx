import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PERMISSIONS } from "@frostguard/shared";
import { RefreshCw, ScrollText, Search } from "lucide-react";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { compactId, fmtDateTime, fmtNumber, humanize } from "@/lib/format";
import { useDebouncedValue } from "@/lib/hooks";
import type { Member } from "@/lib/types";
import {
  Badge,
  Button,
  CopyButton,
  EmptyState,
  ErrorState,
  Field,
  FilterBar,
  Input,
  PageHeader,
  PageSkeleton,
  Pagination,
  Panel,
  PanelHeader,
  SearchInput,
  Select,
  TD,
  TH,
  TR,
  TableWrap,
} from "@/components/ui";

/**
 * The API returns `ip` and omits `userAgent` for audit rows, so this mirrors the
 * live wire shape instead of the broader `AuditLog` helper type in lib/types.
 */
type AuditEntry = {
  id: string | number;
  orgId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  requestId: string | null;
  createdAt: string;
  actor?: { id: string; fullName: string; email: string } | null;
};

const KNOWN_ENTITY_TYPES = [
  "alert",
  "batch",
  "excursion",
  "incident",
  "product",
  "sensor",
  "shipment",
  "storage_unit",
  "user",
  "warehouse",
];

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2) ?? "null";
  } catch {
    return String(value);
  }
}

function startOfDayIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function endOfDayIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function metadataHasContent(metadata: Record<string, unknown> | null): metadata is Record<string, unknown> {
  return Boolean(metadata) && Object.keys(metadata as Record<string, unknown>).length > 0;
}

export default function AuditPage() {
  const { hasPermission } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [entityType, setEntityType] = useState("");
  const [actionSearch, setActionSearch] = useState("");
  const [actorId, setActorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const debouncedAction = useDebouncedValue(actionSearch);
  const actionFilter = debouncedAction.trim();
  const canReadUsers = hasPermission(PERMISSIONS.USER_READ);

  const usersQuery = useQuery({
    queryKey: ["users", "audit-actors"],
    queryFn: () => api.get<Member[]>("/users"),
    enabled: canReadUsers,
    staleTime: 60_000,
  });

  const query = useQuery({
    queryKey: ["audit", page, pageSize, entityType, actionFilter, actorId, from, to],
    queryFn: () =>
      api.page<AuditEntry>("/audit", {
        page,
        pageSize,
        entityType: entityType || undefined,
        action: actionFilter || undefined,
        actorId: actorId || undefined,
        from: startOfDayIso(from),
        to: endOfDayIso(to),
      }),
  });

  useEffect(() => {
    setPage(1);
  }, [entityType, actionFilter, actorId, from, to, pageSize]);

  const rows = query.data?.data ?? [];

  const entityOptions = useMemo(() => {
    const values = new Set(KNOWN_ENTITY_TYPES);
    for (const row of rows) values.add(row.entityType);
    if (entityType) values.add(entityType);
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [rows, entityType]);

  const actorOptions = useMemo(() => {
    const seen = new Map<string, { id: string; label: string }>();
    for (const member of usersQuery.data ?? []) {
      if (!seen.has(member.user.id)) {
        seen.set(member.user.id, { id: member.user.id, label: `${member.user.fullName} · ${member.user.email}` });
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [usersQuery.data]);

  const hasFilters = Boolean(entityType || actionFilter || actorId || from || to);
  const invalidRange = Boolean(from && to && from > to);

  function clearFilters() {
    setEntityType("");
    setActionSearch("");
    setActorId("");
    setFrom("");
    setTo("");
    setPage(1);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Governance"
        title="Audit trail"
        description="Append-only, organization-scoped evidence of every audited action. Rows are written inside the same transaction as the business change they describe."
        actions={
          <>
            <Badge tone="neutral" dot>
              Append-only
            </Badge>
            <Button variant="secondary" size="sm" onClick={() => void query.refetch()} loading={query.isFetching}>
              <RefreshCw className="size-3.5" aria-hidden />
              Refresh
            </Button>
          </>
        }
      />

      <Panel>
        <PanelHeader
          title="Audit events"
          description="Newest first. Actions can be filtered by a substring of the action key; dates are inclusive."
          action={
            query.data && !query.isLoading ? (
              <Badge tone="neutral">{fmtNumber(query.data.total)} events</Badge>
            ) : null
          }
        />

        <FilterBar className="mb-4">
          <SearchInput
            value={actionSearch}
            onChange={setActionSearch}
            placeholder="Filter by action (contains)"
            className="min-w-[15rem] flex-1"
          />
          <Select value={entityType} onChange={(event) => setEntityType(event.target.value)} aria-label="Entity type filter">
            <option value="">All entity types</option>
            {entityOptions.map((value) => (
              <option key={value} value={value}>
                {humanize(value)}
              </option>
            ))}
          </Select>
          {canReadUsers ? (
            <Select
              value={actorId}
              onChange={(event) => setActorId(event.target.value)}
              aria-label="Actor filter"
              disabled={usersQuery.isLoading || usersQuery.isError}
              title={usersQuery.isError ? apiErrorMessage(usersQuery.error) : undefined}
            >
              <option value="">
                {usersQuery.isLoading ? "Loading actors…" : usersQuery.isError ? "Actors unavailable" : "All actors"}
              </option>
              {actorOptions.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.label}
                </option>
              ))}
            </Select>
          ) : null}
          <Field label="From">
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="From date" />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="To date" />
          </Field>
          <Select value={String(pageSize)} onChange={(event) => setPageSize(Number(event.target.value))} aria-label="Page size">
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </Select>
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
          {invalidRange ? (
            <p className="w-full text-[11px] text-amber">The From date is after the To date, so this range will return no events.</p>
          ) : null}
        </FilterBar>

        {query.isLoading ? (
          <PageSkeleton />
        ) : query.isError ? (
          <ErrorState message={apiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No audit events match" : "No audit events recorded"}
            description={
              hasFilters
                ? "Adjust or clear the filters to widen the search."
                : "Audited actions will appear here as soon as they occur in this organization."
            }
            icon={<Search className="size-5" aria-hidden />}
            action={
              hasFilters ? (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <TH>Timestamp</TH>
                  <TH>Actor</TH>
                  <TH>Action</TH>
                  <TH>Entity</TH>
                  <TH>Request ID</TH>
                  <TH>IP</TH>
                  <TH>Metadata</TH>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <TR key={String(entry.id)}>
                    <TD className="whitespace-nowrap text-xs" title={entry.createdAt}>
                      {fmtDateTime(entry.createdAt)}
                    </TD>
                    <TD>
                      {entry.actor ? (
                        <>
                          <p className="text-xs font-medium text-ice">{entry.actor.fullName}</p>
                          <p className="text-[10px] text-mist">{entry.actor.email}</p>
                        </>
                      ) : entry.actorId ? (
                        <span className="text-xs text-mist" title={entry.actorId}>
                          Unknown actor
                        </span>
                      ) : (
                        <span className="text-xs text-mist">System</span>
                      )}
                    </TD>
                    <TD>
                      <code className="font-mono text-[11px] text-ice/90">{entry.action}</code>
                    </TD>
                    <TD>
                      <Badge tone="neutral" className="mb-1">
                        {humanize(entry.entityType)}
                      </Badge>
                      {entry.entityId ? (
                        <p className="font-mono text-[10px] text-mist" title={entry.entityId}>
                          {compactId(entry.entityId, 10)}
                        </p>
                      ) : (
                        <p className="text-[10px] text-mist">—</p>
                      )}
                    </TD>
                    <TD>
                      {entry.requestId ? (
                        <div className="flex items-center gap-1">
                          <code className="font-mono text-[10px] text-mist" title={entry.requestId}>
                            {compactId(entry.requestId, 10)}
                          </code>
                          <CopyButton value={entry.requestId} label="ID" />
                        </div>
                      ) : (
                        <span className="text-xs text-mist">—</span>
                      )}
                    </TD>
                    <TD className="font-mono text-[10px] text-mist">{entry.ip ?? "—"}</TD>
                    <TD>
                      {metadataHasContent(entry.metadata) ? (
                        <details>
                          <summary className="cursor-pointer text-[10px] text-cyan hover:underline">View JSON</summary>
                          <pre className="mt-1 max-h-52 overflow-auto rounded-lg border border-line/50 bg-abyss/70 p-2 font-mono text-[10px] leading-relaxed text-ice/80">
                            {formatJson(entry.metadata)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-xs text-mist">—</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </TableWrap>
            <Pagination
              page={query.data?.page ?? 1}
              totalPages={query.data?.totalPages ?? 1}
              total={query.data?.total}
              onPage={setPage}
            />
          </>
        )}
      </Panel>

      <section className="panel flex items-start gap-3 p-4">
        <ScrollText className="mt-0.5 size-4 shrink-0 text-teal" aria-hidden />
        <div>
          <p className="text-xs font-semibold text-ice">Integrity of the trail</p>
          <p className="mt-0.5 max-w-3xl text-[11px] leading-relaxed text-mist">
            There is no write or delete endpoint for audit events. Each row belongs to this organization and is retained for
            compliance review; filters only narrow this read-only view.
          </p>
        </div>
      </section>
    </div>
  );
}
