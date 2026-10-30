import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, MessageSquare, Search, ShieldAlert, Siren, UserCheck } from "lucide-react";
import { INCIDENT_STATUSES, SEVERITIES } from "@frostguard/shared";
import { api, apiErrorMessage } from "@/lib/api";
import { fmtDateTime, fmtNumber, fmtRelative, fmtTemp, humanize, severityTone, statusTone } from "@/lib/format";
import { useDebouncedValue } from "@/lib/hooks";
import type { Incident, IncidentStats } from "@/lib/types";
import {
  Badge,
  EmptyState,
  ErrorState,
  Kpi,
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
} from "@/components/ui";

export default function IncidentsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [mine, setMine] = useState(false);
  const debounced = useDebouncedValue(search);

  const stats = useQuery({ queryKey: ["incidents", "stats"], queryFn: () => api.get<IncidentStats>("/incidents/stats") });
  const query = useQuery({
    queryKey: ["incidents", page, pageSize, debounced, status, severity, mine],
    queryFn: () =>
      api.page<Incident>("/incidents", {
        page,
        pageSize,
        search: debounced || undefined,
        status: status || undefined,
        severity: severity || undefined,
        assigneeId: mine ? "me" : undefined,
      }),
  });

  useEffect(() => setPage(1), [debounced, status, severity, mine, pageSize]);

  const rows = query.data?.data ?? [];
  const activeOnPage = rows.filter((row) => ["OPEN", "ACKNOWLEDGED", "INVESTIGATING"].includes(row.status)).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Command"
        title="Incidents"
        description="Server-generated incident records with a documented transition trail. Acknowledge, assign, investigate and resolve with an outcome."
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Open" value={stats.data ? fmtNumber(stats.data.open) : "—"} hint="Awaiting acknowledgement" tone={stats.data?.open ? "danger" : "success"} icon={<Siren className="size-4" aria-hidden />} />
        <Kpi label="Critical active" value={stats.data ? fmtNumber(stats.data.criticalOpen) : "—"} hint="Open, acknowledged or investigating" tone={stats.data?.criticalOpen ? "danger" : "success"} icon={<ShieldAlert className="size-4" aria-hidden />} />
        <Kpi label="Investigating" value={stats.data ? fmtNumber(stats.data.investigating) : "—"} hint="Root cause under review" tone="warning" />
        <Kpi label="Resolved" value={stats.data ? fmtNumber(stats.data.resolved) : "—"} hint="Outcome documented" tone="success" icon={<UserCheck className="size-4" aria-hidden />} />
      </section>

      <Panel>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Search incident code or title" className="min-w-[15rem]" />
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
              <option value="">All statuses</option>
              {INCIDENT_STATUSES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
            </Select>
            <SegmentedControl
              label="Severity filter"
              value={severity}
              onChange={setSeverity}
              options={[{ value: "", label: "All" }, ...SEVERITIES.map((value) => ({ value, label: humanize(value) }))]}
            />
            <Select value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Page size">
              {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size} per page</option>)}
            </Select>
          </div>
          <Switch checked={mine} onChange={setMine} label="Assigned to me" />
        </div>

        {query.isLoading ? <PageSkeleton /> : query.isError ? (
          <ErrorState message={apiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No incidents match" description={mine ? "Nothing is currently assigned to you with these filters." : "Adjust the filters or check back after the next telemetry evaluation."} icon={<Search className="size-5" aria-hidden />} />
        ) : (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <TH>Incident</TH>
                  <TH>Severity</TH>
                  <TH>Status</TH>
                  <TH>Source</TH>
                  <TH>Assignee</TH>
                  <TH>Opened</TH>
                  <TH>Activity</TH>
                  <TH aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {rows.map((incident) => (
                  <TR key={incident.id} className="cursor-pointer" onClick={() => navigate(`/app/incidents/${incident.id}`)}>
                    <TD className="min-w-[16rem]">
                      <Link to={`/app/incidents/${incident.id}`} className="font-mono text-[11px] text-cyan hover:underline" onClick={(event) => event.stopPropagation()}>{incident.code}</Link>
                      <p className="mt-0.5 line-clamp-2 text-xs text-ice">{incident.title}</p>
                    </TD>
                    <TD><Badge tone={severityTone(incident.severity)} dot>{incident.severity}</Badge></TD>
                    <TD><Badge tone={statusTone(incident.status)} dot>{humanize(incident.status)}</Badge></TD>
                    <TD>
                      {incident.excursion ? (
                        <>
                          <p className="text-[11px] text-ice">{incident.excursion.sensor?.name ?? "Sensor"}</p>
                          <p className="text-[10px] text-mist">{fmtTemp(incident.excursion.minTemp)} – {fmtTemp(incident.excursion.maxTemp)}</p>
                        </>
                      ) : <span className="text-xs text-mist">—</span>}
                    </TD>
                    <TD className="text-xs">{incident.assignee?.fullName ?? <span className="text-mist">Unassigned</span>}</TD>
                    <TD>
                      <p className="text-xs text-ice">{fmtRelative(incident.openedAt)}</p>
                      <p className="text-[10px] text-mist">{fmtDateTime(incident.openedAt)}</p>
                    </TD>
                    <TD>
                      <span className="inline-flex items-center gap-1 text-xs text-mist">
                        <MessageSquare className="size-3" aria-hidden /> {incident._count?.actions ?? 0}
                      </span>
                    </TD>
                    <TD><ArrowUpRight className="size-3.5 text-mist" aria-hidden /></TD>
                  </TR>
                ))}
              </tbody>
            </TableWrap>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-mist">{activeOnPage} active on this page</p>
              <Pagination page={query.data?.page ?? 1} totalPages={query.data?.totalPages ?? 1} total={query.data?.total} onPage={setPage} />
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
