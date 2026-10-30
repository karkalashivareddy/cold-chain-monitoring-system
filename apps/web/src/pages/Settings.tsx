import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Crown, KeyRound, Search, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { ROLE_KEYS, ROLE_PERMISSIONS, type RoleKey } from "@frostguard/shared";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDateTime, fmtRelative, humanize, type Tone } from "@/lib/format";
import type { Member } from "@/lib/types";
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  CopyButton,
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
  SearchInput,
  Select,
  SimulatedBadge,
  TD,
  TH,
  TR,
  TableWrap,
} from "@/components/ui";

const ASSIGNABLE_ROLES = ROLE_KEYS.filter((role) => role !== "owner");
const ROLE_TONE: Record<string, Tone> = {
  owner: "violet",
  admin: "info",
  manager: "success",
  operator: "warning",
  auditor: "neutral",
  viewer: "neutral",
};

function roleLabel(role: string) {
  return role === "owner" ? "Owner" : humanize(role);
}

function InviteDialog({ open, onClose, onProvisioned }: { open: boolean; onClose: () => void; onProvisioned: (result: { email: string; temporaryPassword: string | null }) => void }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleKey, setRoleKey] = useState<RoleKey>("operator");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.post<{ userId: string; temporaryPassword: string | null }>("/users", {
        email: email.trim().toLowerCase(),
        fullName: fullName.trim(),
        roleKey,
      }),
    onSuccess: (result) => {
      toast.success(result.temporaryPassword ? "Member invited" : "Existing user added to the organization");
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      onProvisioned({ email: email.trim().toLowerCase(), temporaryPassword: result.temporaryPassword });
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  function submit() {
    setError(null);
    if (!email.trim()) return setError("Enter an email address.");
    if (fullName.trim().length < 2) return setError("Enter the member's full name.");
    mutation.mutate();
  }

  return (
    <Modal
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
      title="Invite a member"
      description="Creates an organization membership. New accounts receive a one-time temporary password shown only once."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={mutation.isPending} onClick={submit}><UserPlus className="size-3.5" aria-hidden /> Invite member</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Full name" required>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Priya Nair" autoComplete="off" />
        </Field>
        <Field label="Work email" required hint="If the email already belongs to a FROSTGUARD user, they are added to this organization instead of a new account being created.">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="priya.nair@example.com" autoComplete="off" />
        </Field>
        <Field label="Role" required hint={`${ROLE_PERMISSIONS[roleKey].length} permissions granted by this role. The owner role cannot be granted through an invitation.`}>
          <Select value={roleKey} onChange={(e) => setRoleKey(e.target.value as RoleKey)}>
            {ASSIGNABLE_ROLES.map((role) => (
              <option key={role} value={role}>{roleLabel(role)}</option>
            ))}
          </Select>
        </Field>
      </div>
      {error ? <p className="mt-4 rounded-lg border border-rose/30 bg-rose/10 p-2 text-xs text-rose" role="alert">{error}</p> : null}
    </Modal>
  );
}

function TemporaryPasswordDialog({ result, onClose }: { result: { email: string; temporaryPassword: string | null } | null; onClose: () => void }) {
  return (
    <Modal
      open={Boolean(result)}
      onOpenChange={(value) => !value && onClose()}
      title={result?.temporaryPassword ? "Temporary password issued" : "Membership added"}
      description={result?.temporaryPassword ? "This password is displayed once and is not stored in plain text. Share it over a secure channel." : "The user already had a FROSTGUARD account and now belongs to this organization."}
      size="md"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-3">
        <div className="rounded-xl border border-line/60 bg-abyss/40 p-3 text-xs">
          <p className="text-mist">Member</p>
          <p className="mt-0.5 font-mono text-ice">{result?.email}</p>
        </div>
        {result?.temporaryPassword ? (
          <>
            <div className="rounded-xl border border-amber/30 bg-amber/5 p-3">
              <p className="text-[10px] uppercase tracking-wider text-amber">One-time password</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <code className="break-all font-mono text-sm text-ice">{result.temporaryPassword}</code>
                <CopyButton value={result.temporaryPassword} label="Copy password" />
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-mist">
              The account is created with this password hashed using Argon2id. There is no automated email delivery in this build; the credential is returned once to the inviting administrator.
            </p>
          </>
        ) : (
          <p className="text-xs leading-relaxed text-mist">No new credential was issued. The existing account keeps its current password.</p>
        )}
      </div>
    </Modal>
  );
}

export default function SettingsPage() {
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [provisioned, setProvisioned] = useState<{ email: string; temporaryPassword: string | null } | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [rolePending, setRolePending] = useState<string | null>(null);

  const canManage = hasPermission("user:manage");

  const query = useQuery({
    queryKey: ["members"],
    queryFn: () => api.get<Member[]>("/users"),
  });

  const roleMutation = useMutation({
    mutationFn: (input: { userId: string; roleKey: string }) => api.patch(`/users/${input.userId}/role`, { roleKey: input.roleKey }),
    onMutate: (input) => setRolePending(input.userId),
    onSuccess: () => {
      toast.success("Role updated");
      void queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
    onSettled: () => setRolePending(null),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => api.delete(`/users/${userId}`),
    onSuccess: () => {
      toast.success("Membership removed");
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      setRemoving(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const members = useMemo(() => {
    const rows = query.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((member) => `${member.user.fullName} ${member.user.email}`.toLowerCase().includes(term));
  }, [query.data, search]);

  const all = query.data ?? [];
  const active = all.filter((member) => member.user.isActive).length;
  const owners = all.filter((member) => member.role.key === "owner").length;
  const neverSignedIn = all.filter((member) => !member.user.lastLoginAt).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Members & access"
        description="Organization membership, role assignment and one-time credential issuance. Authorization is enforced by the API, not by this page."
        actions={
          <>
            {canManage ? (
              <Button size="sm" onClick={() => setInviteOpen(true)}><UserPlus className="size-3.5" aria-hidden /> Invite member</Button>
            ) : (
              <Badge tone="neutral">Read-only access</Badge>
            )}
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Members" value={all.length} hint={`${active} active account${active === 1 ? "" : "s"}`} tone="info" icon={<Users className="size-4" aria-hidden />} />
        <Kpi label="Owners" value={owners} hint="Last owner cannot be removed or demoted" tone={owners > 1 ? "success" : "warning"} icon={<Crown className="size-4" aria-hidden />} />
        <Kpi label="Never signed in" value={neverSignedIn} hint="Invited accounts awaiting first login" tone={neverSignedIn ? "warning" : "success"} icon={<KeyRound className="size-4" aria-hidden />} />
        <Kpi label="Your role" value={roleLabel(user?.role ?? "")} hint={user?.organization.name ?? "Organization"} tone="violet" icon={<ShieldCheck className="size-4" aria-hidden />} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.75fr_1fr]">
        <Panel>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <PanelHeader className="mb-0" title="Organization members" description="Every membership change is written to the append-only audit log." />
            <SearchInput value={search} onChange={setSearch} placeholder="Search name or email" className="min-w-[14rem]" />
          </div>

          {query.isLoading ? <PageSkeleton /> : query.isError ? (
            <ErrorState message={apiErrorMessage(query.error)} onRetry={() => void query.refetch()} />
          ) : members.length === 0 ? (
            <EmptyState
              title={search ? "No members match" : "No members"}
              description={search ? "Clear the search to see the full organization." : "Invite the first member to collaborate."}
              icon={<Search className="size-5" aria-hidden />}
            />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <TH>Member</TH>
                  <TH>Role</TH>
                  <TH>Status</TH>
                  <TH>Last sign-in</TH>
                  <TH>Joined</TH>
                  {canManage ? <TH className="text-right">Remove</TH> : null}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const isSelf = member.user.id === user?.id;
                  return (
                    <TR key={member.id}>
                      <TD>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={member.user.fullName} />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-ice">
                              {member.user.fullName}
                              {isSelf ? <span className="ml-1.5 text-[10px] font-normal text-cyan">you</span> : null}
                            </p>
                            <p className="truncate text-[10px] text-mist">{member.user.email}</p>
                          </div>
                        </div>
                      </TD>
                      <TD>
                        {canManage ? (
                          <Select
                            value={member.role.key}
                            aria-label={`Role for ${member.user.fullName}`}
                            disabled={rolePending === member.user.id}
                            onChange={(e) => roleMutation.mutate({ userId: member.user.id, roleKey: e.target.value })}
                            className="min-w-[8.5rem] py-1.5 text-xs"
                          >
                            {ROLE_KEYS.map((role) => (
                              <option key={role} value={role}>{roleLabel(role)}</option>
                            ))}
                          </Select>
                        ) : (
                          <Badge tone={ROLE_TONE[member.role.key] ?? "neutral"}>{roleLabel(member.role.key)}</Badge>
                        )}
                        <p className="mt-1 text-[10px] text-mist">{ROLE_PERMISSIONS[member.role.key as RoleKey]?.length ?? 0} permissions</p>
                      </TD>
                      <TD>
                        <Badge tone={member.user.isActive ? "success" : "danger"} dot>{member.user.isActive ? "Active" : "Inactive"}</Badge>
                      </TD>
                      <TD>
                        <p className="text-xs text-ice">{member.user.lastLoginAt ? fmtRelative(member.user.lastLoginAt) : "Never"}</p>
                        <p className="text-[10px] text-mist">{member.user.lastLoginAt ? fmtDateTime(member.user.lastLoginAt) : "Invitation pending"}</p>
                      </TD>
                      <TD className="text-xs text-mist">{fmtDateTime(member.createdAt)}</TD>
                      {canManage ? (
                        <TD>
                          <div className="flex justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Remove ${member.user.fullName}`}
                              title={isSelf ? "You cannot remove your own membership" : undefined}
                              disabled={isSelf}
                              onClick={() => setRemoving(member)}
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </Button>
                          </div>
                        </TD>
                      ) : null}
                    </TR>
                  );
                })}
              </tbody>
            </TableWrap>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Organization" description="Tenant boundary applied to every query." />
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-3"><dt className="text-mist">Name</dt><dd className="text-right text-ice">{user?.organization.name ?? "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-mist">Slug</dt><dd className="font-mono text-ice">{user?.organization.slug ?? "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-mist">Timezone</dt><dd className="text-ice">{user?.organization.timezone ?? "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-mist">Your account</dt><dd className="truncate text-right text-ice">{user?.email ?? "—"}</dd></div>
            </dl>
            <p className="mt-3 flex items-start gap-1.5 border-t border-line/40 pt-3 text-[10px] leading-relaxed text-mist">
              <Building2 className="mt-0.5 size-3.5 shrink-0 text-cyan" aria-hidden />
              Members can only see data belonging to this organization. Cross-tenant reads are rejected server-side.
            </p>
          </Panel>

          <Panel>
            <PanelHeader title="Access policy" description="Permission counts defined in the shared contract." />
            <ul className="space-y-1.5 text-xs">
              {ROLE_KEYS.map((role) => (
                <li key={role} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Badge tone={ROLE_TONE[role] ?? "neutral"}>{roleLabel(role)}</Badge>
                  </span>
                  <span className="text-mist">{ROLE_PERMISSIONS[role].length} permissions</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-1.5 border-t border-line/40 pt-3 text-[10px] leading-relaxed text-mist">
              <p className="flex items-center gap-1.5 text-teal"><ShieldCheck className="size-3.5" aria-hidden /> Passwords hashed with Argon2id</p>
              <p>Sessions use httpOnly cookies with refresh rotation and family revocation.</p>
              <p>The API re-checks permissions and tenant scope on every request.</p>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Data provenance" description="What this environment contains." />
            <div className="space-y-2 text-[11px] leading-relaxed text-mist">
              <p className="flex items-center gap-2"><SimulatedBadge /> Seeded telemetry is simulated and labelled in the UI.</p>
              <p>Operational records created through the app are written to MySQL after server-side validation. Dashboard counts are computed from those rows, never hardcoded.</p>
              <p>Account disablement, SSO and automated email delivery are not implemented in this release.</p>
            </div>
          </Panel>
        </div>
      </section>

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} onProvisioned={setProvisioned} />
      <TemporaryPasswordDialog result={provisioned} onClose={() => setProvisioned(null)} />
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(value) => !value && setRemoving(null)}
        title="Remove membership"
        description={removing ? `Remove ${removing.user.fullName} (${removing.user.email}) from ${user?.organization.name ?? "this organization"}? Their account and audit history are retained.` : ""}
        confirmLabel="Remove member"
        loading={removeMutation.isPending}
        onConfirm={() => removing && removeMutation.mutate(removing.user.id)}
      />
    </div>
  );
}
