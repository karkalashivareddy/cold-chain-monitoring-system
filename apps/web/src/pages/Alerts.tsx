import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, CheckCheck, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { ALERT_STATUSES, SEVERITIES } from "@frostguard/shared";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDateTime, fmtNumber, fmtRelative, fmtTemp, humanize, severityTone, statusTone } from "@/lib/format";
import { useDebouncedValue } from "@/lib/hooks";
import type { Alert } from "@/lib/types";
import {
  Badge,
  Button,
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
  TD,
  TH,
  TR,
  TableWrap,
} from "@/components/ui";

type AlertRow = Alert & {
  incident?: { id: string; code: string; status: string } | null;
  acknowledgedBy?: { id: string; fullName: string } | null;
};

export default function AlertsPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const debounced = useDebouncedValue(search);

  const query = useQuery({
    queryKey: ["alerts", page, pageSize, debounced, status, severity],
    queryFn: () =>
      api.page<AlertRow>("/alerts", {
        page,
        pageSize,
        search: debounced || undefined,
        status: status || undefined,
        severity: severity || undefined,
      }),
    refetchInterval: 30_000,
  });

  useEffect(() => setPage(1), [debounced, status, severity, pageSize]);

  const acknowledge = useMutation({
    mutationFn: (id: string) => api.post<Alert>(`/alerts/${id}/acknowledge`),
    onMutate: (id) => setAcknowledging(id),
    onSuccess: () => {
      toast.success("Alert acknowledged");
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
    onSettled: () => setAcknowledging(null),
  });

  const rows = query.data?.data ?? [];
  const canWrite = hasPermission("incident:write");
  const openOnPage = rows.filter((row) => row.status === "OPEN").length;
  const criticalOnPage = rows.filter((row) => row.severity === "CRITICAL" && row.status !== "RESOLVED").length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Command"
        title="Alert queue"
        description="Alerts raised by the excursion engine after the producing transaction commits. Acknowledging an alert does not resolve the underlying incident."
        actions={<Badge tone="info"><BellRing className="size-3" aria-hidden /> Auto-refresh 30s</Badge>}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Matching alerts" value={fmtNumber(query.data?.total ?? 0)} hint="Current filters" tone="info" icon={<Bell className="size-4" aria-hidden />} />
        <Kpi label="Open on page" value={fmtNumber(openOnPage)} hint="Awaiting acknowledgement" tone={openOnPage ? "warning" : "success"} />
        <Kpi label="Critical active" value={fmtNumber(criticalOnPage)} hint="Critical and not resolved" tone={criticalOnPage ? "danger" : "success"} icon={<ShieldAlert className="size-4" aria-hidden />} />
        <Kpi label="Acknowledged on page" value={fmtNumber(rows.filter((row) => row.status === "ACKNOWLEDGED").length)} hint="Owned, not resolved" tone="neutral" icon={<CheckCheck className="size-4" aria-hidden />} />
      </section>

      <Panel>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search title or message" className="min-w-[15rem] flex-1" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by alert status">
            <option value="">All statuses</option>
            {ALERT_STATUSES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
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

        {query.isLoading ? <PageSkeleton /> : query.isError ? (
          <ErrorState message={apiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No alerts match" description="Adjust the filters. New alerts appear automatically after committed telemetry evaluation." icon={<Search className="size-5" aria-hidden />} />
        ) : (
          <>
            <TableWrap>
              <thead>
                <tr>
                  <TH>Alert</TH>
                  <TH>Severity</TH>
                  <TH>Source</TH>
                  <TH>Status</TH>
                  <TH>Raised</TH>
                  <TH>Incident</TH>
                  <TH className="text-right">Action</TH>
                </tr>
              </thead>
              <tbody>
                {rows.map((alert) => (
                  <TR key={alert.id}>
                    <TD className="min-w-[18rem]">
                      <p className="text-xs font-medium text-ice">{alert.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-mist">{alert.message}</p>
                      <p className="mt-1 font-mono text-[10px] text-mist/70">{alert.code}</p>
                    </TD>
                    <TD><Badge tone={severityTone(alert.severity)} dot>{alert.severity}</Badge></TD>
                    <TD>
                      {alert.excursion ? (
                        <div className="text-[11px]">
                          <p className="text-ice">{alert.excursion.sensor?.name ?? "Sensor"}</p>
                          <p className="text-mist">{alert.excursion.storageUnit?.name ?? alert.excursion.shipment?.code ?? "—"}</p>
                          <p className="stat-value text-[10px] text-mist">{fmtTemp(alert.excursion.minTemp)} – {fmtTemp(alert.excursion.maxTemp)}</p>
                        </div>
                      ) : <span className="text-xs text-mist">—</span>}
                    </TD>
                    <TD>
                      <Badge tone={statusTone(alert.status)} dot>{humanize(alert.status)}</Badge>
                      {alert.acknowledgedBy ? <p className="mt-1 text-[10px] text-mist">by {alert.acknowledgedBy.fullName}</p> : null}
                    </TD>
                    <TD>
                      <p className="text-xs text-ice">{fmtRelative(alert.createdAt)}</p>
                      <p className="text-[10px] text-mist">{fmtDateTime(alert.createdAt)}</p>
                    </TD>
                    <TD>
                      {alert.incident ? (
                        <Link to={`/app/incidents/${alert.incident.id}`} className="font-mono text-[11px] text-cyan hover:underline">{alert.incident.code}</Link>
                      ) : alarmLink(alert)}
                    </TD>
                    <TD>
                      <div className="flex justify-end">
                        {alert.status === "OPEN" && canWrite ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={acknowledging === alert.id}
                            onClick={() => acknowledge.mutate(alert.id)}
                          >
                            Acknowledge
                          </Button>
                        ) : <span className="text-[10px] text-mist">{alert.status === "RESOLVED" ? "Closed at resolution" : "—"}</span>}
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </TableWrap>
            <Pagination page={query.data?.page ?? 1} totalPages={query.data?.totalPages ?? 1} total={query.data?.total} onPage={setPage} />
          </>
        )}
      </Panel>
    </div>
  );
}

function alarmLink(alert: AlertRow) {
  if (alert.excursion?.shipment) {
    return <Link to={`/app/shipments/${alert.excursion.shipment.id}`} className="text-[11px] text-cyan hover:underline">{alert.excursion.shipment.code}</Link>;
  }
  return <span className="text-xs text-mist">Not linked</span>;
}
