import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  Database,
  Eye,
  FunctionSquare,
  RefreshCw,
  RotateCcw,
  Rows3,
  Table2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { fmtDateTime, fmtNumber, humanize, severityTone, statusTone, toNumber } from "@/lib/format";
import type { DbmsOverview } from "@/lib/types";
import {
  Badge,
  Button,
  CopyButton,
  EmptyState,
  ErrorState,
  Field,
  FilterBar,
  Kpi,
  Modal,
  PageHeader,
  PageSkeleton,
  Panel,
  PanelHeader,
  Select,
  TD,
  TH,
  TR,
  TableWrap,
  Tabs,
} from "@/components/ui";

/* -------------------------------------------------------------------------- */
/*  Wire types                                                                */
/* -------------------------------------------------------------------------- */

type DbmsTableRow = {
  tableName: string;
  tableRows: number;
  dataLengthKb: number;
  indexLengthKb: number;
  engine: string | null;
  collation: string | null;
};

type DbmsView = { name: string; definition: string | null };
type DbmsTrigger = { name: string; event: string; table: string; timing: string; statement: string | null };
type DbmsRoutine = { name: string; type: string; body: string | null };

type ExplainResponse = {
  query: string;
  plan: Array<Record<string, unknown>>;
};

type IncidentRow = {
  status: string;
  severity: string;
  total: number | string | null;
  averageRiskScore: number | string | null;
  oldestOpenedAt: string | null;
};

type RollbackResult = {
  key: string;
  insertedInsideTransaction: boolean;
  rowsAfterRollback: number;
  atomic: boolean;
  explanation: string;
};

const EXPLAIN_QUERIES = [
  {
    value: "telemetry-range",
    label: "Telemetry range",
    detail: "Recent sensor readings for this organization, newest first, limited to a 24-hour window.",
  },
  {
    value: "open-excursions",
    label: "Open excursions",
    detail: "Open temperature excursions ordered by start time.",
  },
  {
    value: "shipment-risk",
    label: "Shipment risk",
    detail: "Dispatched, in-transit and delayed shipments ordered by the server-computed risk score.",
  },
  {
    value: "device-health",
    label: "Device health view",
    detail: "Rows from the v_device_health view ordered by minutes since the last reading.",
  },
] as const;

type ExplainKey = (typeof EXPLAIN_QUERIES)[number]["value"];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2) ?? "null";
  } catch {
    return String(value);
  }
}

/** The server returns `[{ EXPLAIN: "{...}" }]` from EXPLAIN FORMAT=JSON. */
function formatExplainPlan(plan: Array<Record<string, unknown>>): string {
  if (plan.length === 0) return "";
  return plan
    .map((row) => {
      const key = Object.keys(row).find((candidate) => candidate.toLowerCase() === "explain");
      const value = key ? row[key] : row;
      if (typeof value === "string") {
        try {
          return JSON.stringify(JSON.parse(value) as unknown, null, 2);
        } catch {
          return value;
        }
      }
      return formatJson(value);
    })
    .join("\n\n");
}

function formatCount(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") {
    if (/^-?\d+$/.test(value.trim())) {
      try {
        return BigInt(value.trim()).toLocaleString("en-US");
      } catch {
        return value;
      }
    }
    return value;
  }
  return fmtNumber(value);
}

function formatKb(value: number | string | null | undefined): string {
  const numeric = toNumber(value);
  return numeric === null ? "—" : `${fmtNumber(numeric, 1)} KB`;
}

function CodeCard({ title, subtitle, code }: { title: string; subtitle?: ReactNode; code: string | null | undefined }) {
  return (
    <div className="rounded-xl border border-line/60 bg-abyss/30 p-3">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-medium text-ice">{title}</p>
          {subtitle ? <div className="mt-1 flex flex-wrap items-center gap-1.5">{subtitle}</div> : null}
        </div>
        {code ? <CopyButton value={code} label="Copy code" /> : null}
      </div>
      <pre className="max-h-80 overflow-auto rounded-lg border border-line/50 bg-abyss/80 p-3 font-mono text-[11px] leading-relaxed text-ice/85 whitespace-pre">
        {code || "—"}
      </pre>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function DbmsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("tables");
  const [explainKey, setExplainKey] = useState<ExplainKey>("telemetry-range");
  const [rollbackOpen, setRollbackOpen] = useState(false);

  const overview = useQuery({
    queryKey: ["dbms", "overview"],
    queryFn: () => api.get<DbmsOverview>("/dbms/overview"),
  });

  const tables = useQuery({
    queryKey: ["dbms", "tables"],
    queryFn: () => api.get<DbmsTableRow[]>("/dbms/tables"),
    enabled: activeTab === "tables",
  });

  const views = useQuery({
    queryKey: ["dbms", "views"],
    queryFn: () => api.get<DbmsView[]>("/dbms/views"),
    enabled: activeTab === "views",
  });

  const triggers = useQuery({
    queryKey: ["dbms", "triggers"],
    queryFn: () => api.get<DbmsTrigger[]>("/dbms/triggers"),
    enabled: activeTab === "triggers",
  });

  const routines = useQuery({
    queryKey: ["dbms", "routines"],
    queryFn: () => api.get<DbmsRoutine[]>("/dbms/routines"),
    enabled: activeTab === "routines",
  });

  const explain = useQuery({
    queryKey: ["dbms", "explain", explainKey],
    queryFn: () => api.get<ExplainResponse>("/dbms/explain", { query: explainKey }),
    enabled: activeTab === "plans",
  });

  const incidents = useQuery({
    queryKey: ["dbms", "incident-summary"],
    queryFn: () => api.get<IncidentRow[]>("/dbms/incident-summary"),
    enabled: activeTab === "incidents",
  });

  const rollback = useMutation({
    mutationFn: () => api.post<RollbackResult>("/dbms/verify-rollback"),
    onSuccess: (result) => {
      setRollbackOpen(false);
      if (result.atomic) {
        toast.success("Rollback verified: the write was fully undone");
      } else {
        toast.error("Rollback verification returned atomic: false");
      }
    },
    onError: (error) => {
      setRollbackOpen(false);
      toast.error(apiErrorMessage(error));
    },
  });

  const refreshing =
    overview.isFetching ||
    tables.isFetching ||
    views.isFetching ||
    triggers.isFetching ||
    routines.isFetching ||
    explain.isFetching ||
    incidents.isFetching;

  const tableRows = tables.data ?? [];
  const viewRows = views.data ?? [];
  const triggerRows = triggers.data ?? [];
  const routineRows = routines.data ?? [];
  const incidentRows = incidents.data ?? [];
  const planRows = Array.isArray(explain.data?.plan) ? explain.data.plan : [];
  const planText = formatExplainPlan(planRows);
  const selectedExplain = EXPLAIN_QUERIES.find((item) => item.value === explainKey) ?? EXPLAIN_QUERIES[0];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Database lab"
        title="MySQL objects, plans & integrity"
        description="Live MySQL metadata, stored objects, query plans and a transactional rollback check for this organization. Nothing on this page is a mock: every value comes from the API and the database."
        actions={
          <Button
            variant="secondary"
            size="sm"
            loading={refreshing}
            onClick={() => void queryClient.invalidateQueries({ queryKey: ["dbms"] })}
          >
            <RefreshCw className="size-3.5" aria-hidden />
            Refresh
          </Button>
        }
      />

      <section aria-label="Database overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Schema"
          value={overview.data?.database ?? "—"}
          hint="Active MySQL database"
          tone="info"
          icon={<Database className="size-4" aria-hidden />}
        />
        <Kpi
          label="Base tables"
          value={overview.data ? fmtNumber(overview.data.tables) : "—"}
          hint="BASE TABLE objects"
          icon={<Table2 className="size-4" aria-hidden />}
        />
        <Kpi
          label="Views"
          value={overview.data ? fmtNumber(overview.data.views) : "—"}
          hint="information_schema views"
          icon={<Eye className="size-4" aria-hidden />}
        />
        <Kpi
          label="Triggers"
          value={overview.data ? fmtNumber(overview.data.triggers) : "—"}
          hint="Triggers in this schema"
          tone="violet"
          icon={<Zap className="size-4" aria-hidden />}
        />
        <Kpi
          label="Routines"
          value={overview.data ? fmtNumber(overview.data.procedures) : "—"}
          hint="Procedures and functions"
          icon={<FunctionSquare className="size-4" aria-hidden />}
        />
        <Kpi
          label="Indexes"
          value={overview.data ? fmtNumber(overview.data.indexes) : "—"}
          hint="Distinct index names"
          icon={<Boxes className="size-4" aria-hidden />}
        />
        <Kpi
          label="Rows"
          value={overview.data ? fmtNumber(overview.data.rows) : "—"}
          hint="Sum of information_schema table_rows (estimate)"
          tone="warning"
          icon={<Rows3 className="size-4" aria-hidden />}
        />
      </section>

      {overview.isError ? (
        <ErrorState message={apiErrorMessage(overview.error)} onRetry={() => void overview.refetch()} />
      ) : null}

      <section className="panel flex items-start gap-3 p-4">
        <Database className="mt-0.5 size-4 shrink-0 text-cyan" aria-hidden />
        <p className="max-w-4xl text-[11px] leading-relaxed text-mist">
          Counts and sizes are read from MySQL&apos;s <code className="font-mono text-ice">information_schema</code>. For InnoDB,
          <code className="font-mono text-ice"> table_rows</code> is an estimate maintained by the storage engine, not a precise
          count; data and index lengths are reported in kilobytes.
        </p>
      </section>

      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
          { value: "tables", label: "Tables", count: overview.data?.tables },
          { value: "views", label: "Views", count: overview.data?.views },
          { value: "triggers", label: "Triggers", count: overview.data?.triggers },
          { value: "routines", label: "Routines", count: overview.data?.procedures },
          { value: "plans", label: "Query plans" },
          { value: "incidents", label: "Incident summary" },
          { value: "rollback", label: "Rollback demo" },
        ]}
      />

      {activeTab === "tables" ? (
        <Panel>
          <PanelHeader
            title="Base tables"
            description="Row estimates and storage sizes reported by MySQL for the current schema."
            action={tables.data ? <Badge tone="neutral">{fmtNumber(tableRows.length)} tables</Badge> : null}
          />
          {tables.isLoading ? (
            <PageSkeleton />
          ) : tables.isError ? (
            <ErrorState message={apiErrorMessage(tables.error)} onRetry={() => void tables.refetch()} />
          ) : tableRows.length === 0 ? (
            <EmptyState title="No base tables found" description="information_schema returned no BASE TABLE objects for this schema." />
          ) : (
            <>
              <TableWrap>
                <thead>
                  <tr>
                    <TH>Table</TH>
                    <TH>Rows (est.)</TH>
                    <TH>Data size</TH>
                    <TH>Index size</TH>
                    <TH>Engine</TH>
                    <TH>Collation</TH>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((table) => (
                    <TR key={table.tableName}>
                      <TD className="font-mono text-xs text-cyan">{table.tableName}</TD>
                      <TD className="stat-value text-xs">{formatCount(table.tableRows)}</TD>
                      <TD className="stat-value text-xs">{formatKb(table.dataLengthKb)}</TD>
                      <TD className="stat-value text-xs">{formatKb(table.indexLengthKb)}</TD>
                      <TD className="font-mono text-[10px] text-ice/80">{table.engine ?? "—"}</TD>
                      <TD className="font-mono text-[10px] text-ice/80">{table.collation ?? "—"}</TD>
                    </TR>
                  ))}
                </tbody>
              </TableWrap>
              <p className="mt-3 text-[10px] leading-relaxed text-mist">
                Rows are InnoDB estimates. Sizes are rounded from the byte values returned by information_schema.
              </p>
            </>
          )}
        </Panel>
      ) : null}

      {activeTab === "views" ? (
        <Panel>
          <PanelHeader
            title="Views"
            description="View definitions exactly as stored in information_schema."
            action={views.data ? <Badge tone="neutral">{fmtNumber(viewRows.length)} views</Badge> : null}
          />
          {views.isLoading ? (
            <PageSkeleton />
          ) : views.isError ? (
            <ErrorState message={apiErrorMessage(views.error)} onRetry={() => void views.refetch()} />
          ) : viewRows.length === 0 ? (
            <EmptyState title="No views found" description="This schema does not expose any views." />
          ) : (
            <div className="space-y-3">
              {viewRows.map((view) => (
                <CodeCard
                  key={view.name}
                  title={view.name}
                  subtitle={<Badge tone="info">View definition</Badge>}
                  code={view.definition}
                />
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {activeTab === "triggers" ? (
        <Panel>
          <PanelHeader
            title="Triggers"
            description="Timing, event and statement for every trigger in this schema."
            action={triggers.data ? <Badge tone="neutral">{fmtNumber(triggerRows.length)} triggers</Badge> : null}
          />
          {triggers.isLoading ? (
            <PageSkeleton />
          ) : triggers.isError ? (
            <ErrorState message={apiErrorMessage(triggers.error)} onRetry={() => void triggers.refetch()} />
          ) : triggerRows.length === 0 ? (
            <EmptyState title="No triggers found" description="This schema does not define any triggers." />
          ) : (
            <div className="space-y-3">
              {triggerRows.map((trigger) => (
                <CodeCard
                  key={trigger.name}
                  title={trigger.name}
                  subtitle={
                    <>
                      <Badge tone="violet">{trigger.timing}</Badge>
                      <Badge tone="info">{trigger.event}</Badge>
                      <Badge tone="neutral">{trigger.table}</Badge>
                    </>
                  }
                  code={trigger.statement}
                />
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {activeTab === "routines" ? (
        <Panel>
          <PanelHeader
            title="Stored routines"
            description="Procedure and function bodies from information_schema.routines."
            action={routines.data ? <Badge tone="neutral">{fmtNumber(routineRows.length)} routines</Badge> : null}
          />
          {routines.isLoading ? (
            <PageSkeleton />
          ) : routines.isError ? (
            <ErrorState message={apiErrorMessage(routines.error)} onRetry={() => void routines.refetch()} />
          ) : routineRows.length === 0 ? (
            <EmptyState title="No routines found" description="This schema does not define any procedures or functions." />
          ) : (
            <div className="space-y-3">
              {routineRows.map((routine) => (
                <CodeCard
                  key={routine.name}
                  title={routine.name}
                  subtitle={
                    <Badge tone={routine.type === "PROCEDURE" ? "info" : "violet"}>{routine.type}</Badge>
                  }
                  code={routine.body}
                />
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {activeTab === "plans" ? (
        <Panel>
          <PanelHeader
            title="Query plans"
            description="MySQL EXPLAIN FORMAT=JSON output for a fixed set of read queries."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="violet" dot>
                  MySQL output
                </Badge>
                <Button variant="secondary" size="sm" loading={explain.isFetching} onClick={() => void explain.refetch()}>
                  <RefreshCw className="size-3.5" aria-hidden />
                  Re-plan
                </Button>
              </div>
            }
          />
          <FilterBar className="mb-4">
            <Field label="Statement" className="min-w-[16rem]">
              <Select
                value={explainKey}
                onChange={(event) => setExplainKey(event.target.value as ExplainKey)}
                aria-label="Statement to explain"
              >
                {EXPLAIN_QUERIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="max-w-xl pb-2 text-[11px] leading-relaxed text-mist">{selectedExplain.detail}</p>
          </FilterBar>

          {explain.isLoading ? (
            <PageSkeleton />
          ) : explain.isError ? (
            <ErrorState message={apiErrorMessage(explain.error)} onRetry={() => void explain.refetch()} />
          ) : planRows.length === 0 ? (
            <EmptyState
              title="No plan returned"
              description="MySQL returned no EXPLAIN rows for this statement in the current schema."
            />
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-mist">Raw EXPLAIN FORMAT=JSON</p>
                <CopyButton value={planText} label="Copy JSON" />
              </div>
              <pre className="max-h-[32rem] overflow-auto rounded-xl border border-line/60 bg-abyss/80 p-4 font-mono text-[11px] leading-relaxed text-ice/85 whitespace-pre">
                {planText}
              </pre>
              <p className="mt-3 max-w-4xl text-[10px] leading-relaxed text-mist">
                This is MySQL&apos;s own optimizer plan, rendered verbatim from the API response. FROSTGUARD does not
                summarise, score or re-estimate it. Costs, row counts and access methods are MySQL estimates and can change
                as table statistics are refreshed.
              </p>
            </>
          )}
        </Panel>
      ) : null}

      {activeTab === "incidents" ? (
        <Panel>
          <PanelHeader
            title="Incident summary procedure"
            description="Direct output of CALL sp_incident_summary(org_id) for the current organization."
            action={incidents.data ? <Badge tone="neutral">{fmtNumber(incidentRows.length)} rows</Badge> : null}
          />
          {incidents.isLoading ? (
            <PageSkeleton />
          ) : incidents.isError ? (
            <ErrorState message={apiErrorMessage(incidents.error)} onRetry={() => void incidents.refetch()} />
          ) : incidentRows.length === 0 ? (
            <EmptyState
              title="The procedure returned no rows"
              description="There are no incident rows to summarise for this organization."
            />
          ) : (
            <>
              <TableWrap>
                <thead>
                  <tr>
                    <TH>Status</TH>
                    <TH>Severity</TH>
                    <TH>Incidents</TH>
                    <TH>Average risk score</TH>
                    <TH>Oldest open</TH>
                  </tr>
                </thead>
                <tbody>
                  {incidentRows.map((row, index) => (
                    <TR key={`${row.status}-${row.severity}-${index}`}>
                      <TD>
                        <Badge tone={statusTone(row.status)} dot>
                          {humanize(row.status)}
                        </Badge>
                      </TD>
                      <TD>
                        <Badge tone={severityTone(row.severity)}>{humanize(row.severity)}</Badge>
                      </TD>
                      <TD className="stat-value text-xs">{formatCount(row.total)}</TD>
                      <TD className="stat-value text-xs">{fmtNumber(toNumber(row.averageRiskScore), 1)}</TD>
                      <TD className="text-xs">{fmtDateTime(row.oldestOpenedAt)}</TD>
                    </TR>
                  ))}
                </tbody>
              </TableWrap>
              <details className="mt-3">
                <summary className="cursor-pointer text-[10px] text-cyan hover:underline">Raw procedure rows</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded-xl border border-line/60 bg-abyss/80 p-3 font-mono text-[10px] leading-relaxed text-ice/80">
                  {formatJson(incidentRows)}
                </pre>
              </details>
              <p className="mt-3 text-[10px] leading-relaxed text-mist">
                These values are produced by the stored procedure, not aggregated in the browser. Numeric strings are rendered
                defensively so large counts stay exact.
              </p>
            </>
          )}
        </Panel>
      ) : null}

      {activeTab === "rollback" ? (
        <Panel>
          <PanelHeader
            title="Transactional rollback verification"
            description="Demonstrates real atomicity: a write inside an InnoDB transaction is deliberately rolled back and then counted."
            action={<Badge tone="warning" dot>Writes, then rolls back</Badge>}
          />

          <div className="grid gap-4 lg:grid-cols-3">
            <ol className="space-y-2 text-[11px] leading-relaxed text-mist lg:col-span-2">
              <li>
                <span className="font-semibold text-ice">1.</span> A temporary idempotency record is inserted inside a single
                database transaction.
              </li>
              <li>
                <span className="font-semibold text-ice">2.</span> The transaction is deliberately rolled back before commit.
              </li>
              <li>
                <span className="font-semibold text-ice">3.</span> A separate query counts matching rows after the rollback. The
                <code className="mx-1 font-mono text-ice">atomic</code> result is derived from that count, not assumed in
                application memory.
              </li>
            </ol>
            <div className="flex items-start lg:justify-end">
              <Button variant="danger" onClick={() => setRollbackOpen(true)}>
                <RotateCcw className="size-4" aria-hidden />
                Run rollback verification
              </Button>
            </div>
          </div>

          {rollback.isError ? (
            <div className="mt-4">
              <ErrorState message={apiErrorMessage(rollback.error)} />
            </div>
          ) : null}

          {rollback.data ? (
            <div className="mt-4 rounded-xl border border-line/60 bg-abyss/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone={rollback.data.atomic ? "success" : "danger"} dot>
                  {rollback.data.atomic ? "Atomic: true" : "Atomic: false"}
                </Badge>
                <div className="flex min-w-0 items-center gap-1">
                  <code className="truncate font-mono text-[10px] text-mist" title={rollback.data.key}>
                    {rollback.data.key}
                  </code>
                  <CopyButton value={rollback.data.key} label="Key" />
                </div>
              </div>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-line/50 bg-white/[0.02] p-2.5">
                  <dt className="text-[10px] uppercase tracking-wider text-mist">Inserted inside transaction</dt>
                  <dd className="stat-value mt-1 text-sm text-ice">
                    {rollback.data.insertedInsideTransaction ? "Yes" : "No"}
                  </dd>
                </div>
                <div className="rounded-lg border border-line/50 bg-white/[0.02] p-2.5">
                  <dt className="text-[10px] uppercase tracking-wider text-mist">Rows after rollback</dt>
                  <dd className="stat-value mt-1 text-sm text-ice">{formatCount(rollback.data.rowsAfterRollback)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-[11px] leading-relaxed text-mist">{rollback.data.explanation}</p>
              <details className="mt-3">
                <summary className="cursor-pointer text-[10px] text-cyan hover:underline">Raw result</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded-xl border border-line/60 bg-abyss/80 p-3 font-mono text-[10px] leading-relaxed text-ice/80">
                  {formatJson(rollback.data)}
                </pre>
              </details>
            </div>
          ) : null}

          <p className="mt-3 text-[10px] leading-relaxed text-mist">
            No business data is changed. A fresh random key is used on every run, and the temporary row is never visible
            outside the transaction.
          </p>
        </Panel>
      ) : null}

      <Modal
        open={rollbackOpen}
        onOpenChange={(open) => {
          if (!open && !rollback.isPending) setRollbackOpen(false);
        }}
        title="Run rollback verification?"
        description="This executes a real database transaction, rolls it back, and counts the rows afterwards."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRollbackOpen(false)} disabled={rollback.isPending}>
              Cancel
            </Button>
            <Button variant="danger" loading={rollback.isPending} onClick={() => rollback.mutate()}>
              Run verification
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-xs leading-relaxed text-mist">
          <p>
            Inside one InnoDB transaction the API inserts a temporary idempotency record, throws deliberately, and lets the
            transaction roll back.
          </p>
          <p>
            A separate count then checks how many rows remain. The reported
            <code className="mx-1 font-mono text-ice">atomic</code> flag comes from that database count.
          </p>
          <p>No business records are modified, and the action can be repeated safely.</p>
        </div>
      </Modal>
    </div>
  );
}
