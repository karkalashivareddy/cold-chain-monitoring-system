import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ClipboardCheck, MessageSquarePlus, Search, ShieldCheck, Siren, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDateTime, fmtDuration, fmtRelative, fmtTemp, humanize, severityTone, statusTone } from "@/lib/format";
import type { AssignableMember, Incident, IncidentDetail } from "@/lib/types";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Kpi,
  Modal,
  PageHeader,
  PageSkeleton,
  Panel,
  PanelHeader,
  Select,
  Textarea,
} from "@/components/ui";

const OUTCOMES = [
  { value: "PRODUCT_SAFE", label: "Product safe — released" },
  { value: "DISPATCHED_UNDER_DEVIATION", label: "Dispatched under documented deviation" },
  { value: "PRODUCT_DISCARDED", label: "Product discarded" },
  { value: "FALSE_ALARM", label: "False alarm — sensor or data issue" },
] as const;

type ActionKind = "acknowledge" | "assign" | "investigate" | "resolve" | "note" | null;

function ActionDialog({
  kind,
  onClose,
  incident,
}: {
  kind: ActionKind;
  onClose: () => void;
  incident: IncidentDetail;
}) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [outcome, setOutcome] = useState("PRODUCT_SAFE");
  const [rootCause, setRootCause] = useState("");
  const [error, setError] = useState<string | null>(null);

  const members = useQuery({
    queryKey: ["users", "assignable"],
    queryFn: () => api.get<AssignableMember[]>("/users/assignable"),
    enabled: kind === "assign",
  });

  useEffect(() => {
    if (!kind) return;
    setNotes("");
    setError(null);
    setRootCause("");
    setAssigneeId(incident.assigneeId ?? "");
  }, [kind, incident.assigneeId]);

  const mutation = useMutation({
    mutationFn: async () => {
      switch (kind) {
        case "acknowledge":
          return api.post<Incident>(`/incidents/${incident.id}/acknowledge`, { notes: notes.trim() || undefined });
        case "assign": {
          if (!assigneeId) throw new Error("Select a member to assign.");
          return api.post<Incident>(`/incidents/${incident.id}/assign`, { assigneeId });
        }
        case "investigate":
          return api.post<Incident>(`/incidents/${incident.id}/investigate`, { notes: notes.trim() || undefined });
        case "resolve":
          return api.post<Incident>(`/incidents/${incident.id}/resolve`, {
            resolutionNotes: notes.trim(),
            outcome,
            rootCause: rootCause.trim() || null,
          });
        case "note":
          return api.post(`/incidents/${incident.id}/notes`, { notes: notes.trim() });
        default:
          throw new Error("Unknown action");
      }
    },
    onSuccess: () => {
      const labels: Record<Exclude<ActionKind, null>, string> = {
        acknowledge: "Incident acknowledged",
        assign: "Incident reassigned",
        investigate: "Investigation started",
        resolve: "Incident resolved with documented outcome",
        note: "Note added",
      };
      if (kind) toast.success(labels[kind]);
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  const titles: Record<Exclude<ActionKind, null>, string> = {
    acknowledge: "Acknowledge incident",
    assign: "Assign incident",
    investigate: "Start investigation",
    resolve: "Resolve incident",
    note: "Add note",
  };

  const descriptions: Record<Exclude<ActionKind, null>, string> = {
    acknowledge: "Acknowledging records the time and actor. It does not resolve the incident.",
    assign: "The assignee is notified in-app. Only active members of this organization can be selected.",
    investigate: "Move the incident into active investigation and record initial findings.",
    resolve: "Resolution requires an outcome and at least 10 characters of notes. The linked alert and excursion are closed in the same transaction.",
    note: "Notes append to the incident action trail and are audited.",
  };

  function submit() {
    setError(null);
    if (kind === "resolve" && notes.trim().length < 10) return setError("Resolution notes must be at least 10 characters.");
    if (kind === "note" && notes.trim().length < 2) return setError("Enter a note.");
    mutation.mutate();
  }

  if (!kind) return null;

  return (
    <Modal
      open={Boolean(kind)}
      onOpenChange={(value) => !value && onClose()}
      title={titles[kind]}
      description={descriptions[kind]}
      size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={mutation.isPending} onClick={submit}>{kind === "resolve" ? "Resolve incident" : "Confirm"}</Button></>}
    >
      <div className="space-y-4">
        {kind === "assign" ? (
          <Field label="Assignee" required>
            <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Select a member…</option>
              {(members.data ?? []).map((member) => (
                <option key={member.id} value={member.id}>{member.fullName} · {humanize(member.role)}</option>
              ))}
            </Select>
          </Field>
        ) : null}

        {kind === "resolve" ? (
          <>
            <Field label="Outcome" required>
              <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                {OUTCOMES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </Select>
            </Field>
            <Field label="Root cause">
              <Input value={rootCause} onChange={(e) => setRootCause(e.target.value)} placeholder="Door seal failure, compressor fault, false reading…" />
            </Field>
          </>
        ) : null}

        {kind !== "assign" ? (
          <Field label={kind === "resolve" ? "Resolution notes" : "Notes"} required={kind === "resolve" || kind === "note"} hint={kind === "resolve" ? "Minimum 10 characters." : "Optional context for the audit trail."}>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={kind === "resolve" ? "What was verified, what product was released/discarded, and evidence references…" : "Additional context…"} />
          </Field>
        ) : null}
      </div>
      {error ? <p className="mt-4 rounded-lg border border-rose/30 bg-rose/10 p-2 text-xs text-rose" role="alert">{error}</p> : null}
    </Modal>
  );
}

export default function IncidentDetailPage() {
  const { id = "" } = useParams();
  const { hasPermission } = useAuth();
  const [action, setAction] = useState<ActionKind>(null);

  const query = useQuery({
    queryKey: ["incidents", id],
    queryFn: () => api.get<IncidentDetail>(`/incidents/${id}`),
    enabled: Boolean(id),
  });

  if (query.isLoading) return <PageSkeleton />;
  if (query.isError || !query.data) {
    return (
      <div className="space-y-4">
        <Link to="/app/incidents" className="inline-flex items-center gap-1 text-xs text-mist hover:text-ice"><ArrowLeft className="size-3.5" aria-hidden /> Back to incidents</Link>
        <ErrorState message={apiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const incident = query.data;
  const canWrite = hasPermission("incident:write");
  const canResolve = hasPermission("incident:resolve");
  const isOpen = incident.status === "OPEN";
  const isActive = ["OPEN", "ACKNOWLEDGED", "INVESTIGATING"].includes(incident.status);
  const canInvestigate = incident.status === "ACKNOWLEDGED";
  const canResolveNow = ["ACKNOWLEDGED", "INVESTIGATING"].includes(incident.status);
  const excursion = incident.excursion;

  return (
    <div className="space-y-5">
      <div>
        <Link to="/app/incidents" className="inline-flex items-center gap-1 text-xs text-mist hover:text-ice"><ArrowLeft className="size-3.5" aria-hidden /> Back to incidents</Link>
        <PageHeader
          className="mt-3"
          eyebrow="Incident record"
          title={incident.code}
          description={incident.title}
          actions={
            <>
              <Badge tone={severityTone(incident.severity)} dot>{incident.severity}</Badge>
              <Badge tone={statusTone(incident.status)} dot>{humanize(incident.status)}</Badge>
              {canWrite && isActive ? <Button variant="secondary" size="sm" onClick={() => setAction("assign")}><UserPlus className="size-3.5" aria-hidden /> Assign</Button> : null}
              {canWrite && isOpen ? <Button size="sm" onClick={() => setAction("acknowledge")}><ShieldCheck className="size-3.5" aria-hidden /> Acknowledge</Button> : null}
              {canWrite && canInvestigate ? <Button size="sm" onClick={() => setAction("investigate")}><Search className="size-3.5" aria-hidden /> Investigate</Button> : null}
              {canResolve && canResolveNow ? <Button variant="success" size="sm" onClick={() => setAction("resolve")}><ClipboardCheck className="size-3.5" aria-hidden /> Resolve</Button> : null}
            </>
          }
        />
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Opened" value={fmtRelative(incident.openedAt)} hint={fmtDateTime(incident.openedAt)} tone="info" icon={<Siren className="size-4" aria-hidden />} />
        <Kpi label="Assignee" value={incident.assignee?.fullName ?? "Unassigned"} hint={incident.assignee?.email ?? "No owner yet"} tone={incident.assignee ? "success" : "warning"} />
        <Kpi label="Excursion" value={excursion ? `${fmtTemp(excursion.minTemp)} – ${fmtTemp(excursion.maxTemp)}` : "None linked"} hint={excursion ? `${fmtDuration(excursion.durationSeconds)} · ${excursion.status}` : "No excursion record"} tone={excursion ? "warning" : "neutral"} />
        <Kpi label="Actions" value={incident.actions.length} hint="Append-only trail" tone="neutral" />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Panel>
            <PanelHeader title="Incident summary" description="Generated by the excursion engine; narrative fields are maintained by operators." />
            <p className="text-sm leading-relaxed text-ice/90">{incident.description ?? "No description was recorded for this incident."}</p>
            <dl className="mt-4 grid gap-3 border-t border-line/40 pt-4 text-xs sm:grid-cols-2">
              <div><dt className="text-mist">Created by</dt><dd className="mt-0.5 text-ice">{incident.createdBy?.fullName ?? "System"}</dd></div>
              <div><dt className="text-mist">Acknowledged</dt><dd className="mt-0.5 text-ice">{incident.acknowledgedAt ? fmtDateTime(incident.acknowledgedAt) : "Not yet"}</dd></div>
              <div><dt className="text-mist">Resolved</dt><dd className="mt-0.5 text-ice">{incident.resolvedAt ? fmtDateTime(incident.resolvedAt) : "Not yet"}</dd></div>
              <div><dt className="text-mist">Root cause</dt><dd className="mt-0.5 text-ice">{incident.rootCause ?? "Not recorded"}</dd></div>
              <div><dt className="text-mist">Outcome</dt><dd className="mt-0.5 text-ice">{incident.outcome ? humanize(incident.outcome) : "Not recorded"}</dd></div>
              <div><dt className="text-mist">Closed</dt><dd className="mt-0.5 text-ice">{incident.closedAt ? fmtDateTime(incident.closedAt) : "Close transition not exposed"}</dd></div>
            </dl>
            {incident.resolutionNotes ? (
              <div className="mt-4 rounded-xl border border-teal/25 bg-teal/5 p-3">
                <p className="text-[10px] uppercase tracking-wider text-teal">Resolution notes</p>
                <p className="mt-1 text-xs leading-relaxed text-ice/90">{incident.resolutionNotes}</p>
              </div>
            ) : null}
          </Panel>

          <Panel>
            <PanelHeader
              title="Action trail"
              description="Every acknowledgement, assignment, investigation, note and resolution is recorded."
              action={canWrite ? <Button variant="secondary" size="sm" onClick={() => setAction("note")}><MessageSquarePlus className="size-3.5" aria-hidden /> Add note</Button> : null}
            />
            {incident.actions.length === 0 ? (
              <EmptyState title="No actions yet" description="Acknowledge the incident to begin the response trail." />
            ) : (
              <ol className="relative space-y-4 border-l border-line/70 pl-5">
                {incident.actions.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span className="absolute -left-[1.42rem] top-1 size-2 rounded-full bg-cyan ring-4 ring-abyss" aria-hidden />
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{humanize(entry.action)}</Badge>
                      <span className="text-[10px] text-mist">{fmtDateTime(entry.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-xs text-ice">{entry.notes ?? "No note supplied."}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-mist">
                      {entry.actor ? <><Avatar name={entry.actor.fullName} className="size-4 text-[8px]" /> {entry.actor.fullName}</> : "System"}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Linked excursion" description="Server-evaluated temperature evidence." />
            {excursion ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={severityTone(excursion.severity)} dot>{excursion.severity}</Badge>
                  <Badge tone={statusTone(excursion.status)}>{humanize(excursion.status)}</Badge>
                </div>
                <div className="rounded-xl border border-line/60 bg-abyss/40 p-3 text-xs">
                  <p className="text-mist">Observed</p>
                  <p className="stat-value mt-0.5 text-lg text-ice">{fmtTemp(excursion.minTemp)} – {fmtTemp(excursion.maxTemp)}</p>
                  <p className="mt-1 text-[10px] text-mist">Permitted {fmtTemp(excursion.thresholdMin)} – {fmtTemp(excursion.thresholdMax)}</p>
                </div>
                <dl className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2"><dt className="text-mist">Started</dt><dd className="text-right text-ice">{fmtDateTime(excursion.startedAt)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-mist">Duration</dt><dd className="text-ice">{fmtDuration(excursion.durationSeconds)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-mist">Sensor</dt><dd className="text-right text-ice">{excursion.sensor?.name ?? "—"}<br /><span className="font-mono text-[10px] text-mist">{excursion.sensor?.deviceId}</span></dd></div>
                  {excursion.storageUnit ? <div className="flex justify-between gap-2"><dt className="text-mist">Storage unit</dt><dd className="text-right text-ice">{excursion.storageUnit.name}<br /><span className="text-[10px] text-mist">{excursion.storageUnit.warehouse?.name}</span></dd></div> : null}
                </dl>
                {excursion.shipment ? <Link to={`/app/shipments/${excursion.shipment.id}`} className="inline-block text-[11px] text-cyan hover:underline">Shipment {excursion.shipment.code} →</Link> : null}
              </div>
            ) : <p className="text-xs text-mist">This incident is not linked to an excursion.</p>}
          </Panel>

          <Panel>
            <PanelHeader title="Linked alert" description="The alert raised by the same evaluation." />
            {incident.alert ? (
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={severityTone(incident.alert.severity)} dot>{incident.alert.severity}</Badge>
                  <Badge tone={statusTone(incident.alert.status)}>{humanize(incident.alert.status)}</Badge>
                </div>
                <p className="font-medium text-ice">{incident.alert.title}</p>
                <p className="leading-relaxed text-mist">{incident.alert.message}</p>
                <p className="text-[10px] text-mist">Raised {fmtDateTime(incident.alert.createdAt)}</p>
                <Link to="/app/alerts" className="inline-block text-[11px] text-cyan hover:underline">Open alert queue →</Link>
              </div>
            ) : <p className="text-xs text-mist">No alert is linked to this incident.</p>}
          </Panel>

          <Panel>
            <PanelHeader title="Transitions" description="Transitions enforced server-side." />
            <ol className="space-y-2 text-[11px] text-mist">
              <li className={incident.status !== "OPEN" ? "text-teal" : "text-ice"}>OPEN → ACKNOWLEDGED</li>
              <li className={["INVESTIGATING", "RESOLVED"].includes(incident.status) ? "text-teal" : ""}>ACKNOWLEDGED → INVESTIGATING</li>
              <li className={incident.status === "RESOLVED" ? "text-teal" : ""}>INVESTIGATING → RESOLVED</li>
              <li>Resolution closes the linked alert and excursion atomically.</li>
              <li className="text-mist/70">There is no client-side close endpoint; closed state is not exposed in this release.</li>
            </ol>
          </Panel>
        </div>
      </section>

      <ActionDialog kind={action} onClose={() => setAction(null)} incident={incident} />
    </div>
  );
}
