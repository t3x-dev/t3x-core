'use client';

import type { NamespaceMemberRole, NamespaceMembership } from '@t3x-dev/api-client';
import { Copy, Loader2, MailPlus, RefreshCw, Trash2, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatUserFacingError } from '@/domain/format/errors';
import { useNamespaceCollaboration } from '@/hooks/accounts/useNamespaceCollaboration';
import {
  selectActiveNamespaceAccount,
  useNamespaceAccountStore,
} from '@/store/namespaceAccountStore';

const MEMBER_ROLES: readonly NamespaceMemberRole[] = ['admin', 'editor', 'viewer'];

function principalLabel(member: NamespaceMembership): string {
  if (member.principal.kind === 'human') {
    return member.principal.display_name ?? member.principal.email ?? member.principal.principal_id;
  }
  return member.principal.display_name ?? member.principal.principal_id;
}

export function NamespaceCollaborationPanel() {
  const activeAccount = useNamespaceAccountStore(selectActiveNamespaceAccount);
  const namespaceId = activeAccount?.namespace.namespace_id ?? null;
  const canReadMembers =
    activeAccount?.authorized_actions.includes('namespace:members:read') ?? false;
  const canManageMembers =
    activeAccount?.authorized_actions.includes('namespace:members:manage') ?? false;
  const canManageInvitations =
    activeAccount?.authorized_actions.includes('namespace:invitations:manage') ?? false;
  const {
    membersQuery,
    invitationsQuery,
    updateMemberRole,
    revokeMember: revokeMemberCommand,
    createInvitation: createInvitationCommand,
    revokeInvitation: revokeInvitationCommand,
  } = useNamespaceCollaboration({ namespaceId, canReadMembers, canManageInvitations });
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<NamespaceMemberRole>('editor');
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [busyInvitationId, setBusyInvitationId] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);

  useEffect(() => {
    setInviteEmail('');
    setInvitationToken(null);
  }, [namespaceId]);

  if (!activeAccount || !namespaceId || !canReadMembers) return null;

  async function changeMemberRole(member: NamespaceMembership, role: NamespaceMemberRole) {
    if (!namespaceId || member.role === role || member.role === 'owner') return;
    setBusyMemberId(member.membership_id);
    try {
      await updateMemberRole(member, role);
      toast.success('Member role updated');
    } catch (error) {
      toast.error(formatUserFacingError(error, 'Failed to update member role.'));
    } finally {
      setBusyMemberId(null);
    }
  }

  async function revokeMember(member: NamespaceMembership) {
    if (
      !namespaceId ||
      member.role === 'owner' ||
      !window.confirm(`Remove ${principalLabel(member)} from this workspace?`)
    ) {
      return;
    }
    setBusyMemberId(member.membership_id);
    try {
      await revokeMemberCommand(member.membership_id);
      toast.success('Member removed');
    } catch (error) {
      toast.error(formatUserFacingError(error, 'Failed to remove member.'));
    } finally {
      setBusyMemberId(null);
    }
  }

  async function createInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!namespaceId || !inviteEmail.trim()) return;
    setIsInviting(true);
    setInvitationToken(null);
    try {
      const response = await createInvitationCommand(inviteEmail.trim(), inviteRole);
      if (!response) return;
      setInviteEmail('');
      setInvitationToken(response.delivery.mode === 'manual' ? response.delivery.token : null);
      toast.success(
        response.delivery.mode === 'email_queued'
          ? 'Invitation email queued'
          : 'Invitation created—copy the one-time link token'
      );
    } catch (error) {
      toast.error(formatUserFacingError(error, 'Failed to create invitation.'));
    } finally {
      setIsInviting(false);
    }
  }

  async function revokeInvitation(invitationId: string) {
    if (!window.confirm('Revoke this pending invitation?')) return;
    setBusyInvitationId(invitationId);
    try {
      await revokeInvitationCommand(invitationId);
      toast.success('Invitation revoked');
    } catch (error) {
      toast.error(formatUserFacingError(error, 'Failed to revoke invitation.'));
    } finally {
      setBusyInvitationId(null);
    }
  }

  async function copyInvitationToken() {
    if (!invitationToken) return;
    try {
      await navigator.clipboard.writeText(invitationToken);
      toast.success('Invitation token copied');
    } catch {
      toast.error('Could not copy invitation token');
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-primary)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <UsersRound className="h-4 w-4" />
            {activeAccount.namespace.display_name} members
          </h2>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            Roles and actions come from the server-authorized namespace projection.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={membersQuery.refetch}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {membersQuery.error ? (
        <p className="text-sm text-destructive">
          {formatUserFacingError(membersQuery.error, 'Failed to load members.')}
        </p>
      ) : membersQuery.isLoading && !membersQuery.data ? (
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading members
        </div>
      ) : (
        <div className="divide-y divide-[var(--stroke-divider)]">
          {(membersQuery.data?.members ?? []).map((member) => (
            <div key={member.membership_id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {principalLabel(member)}
                </p>
                <p className="truncate text-xs text-[var(--text-tertiary)]">
                  {member.principal.kind} · {member.status}
                </p>
              </div>
              {canManageMembers && member.role !== 'owner' ? (
                <Select
                  value={member.role}
                  disabled={busyMemberId === member.membership_id}
                  onValueChange={(role) =>
                    void changeMemberRole(member, role as NamespaceMemberRole)
                  }
                >
                  <SelectTrigger className="w-28" size="sm" aria-label="Member role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEMBER_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="rounded-full border border-[var(--stroke-divider)] px-2 py-1 text-xs text-[var(--text-secondary)]">
                  {member.role}
                </span>
              )}
              {canManageMembers && member.role !== 'owner' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${principalLabel(member)}`}
                  disabled={busyMemberId === member.membership_id}
                  onClick={() => void revokeMember(member)}
                >
                  {busyMemberId === member.membership_id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {canManageInvitations && (
        <div className="space-y-3 border-t border-[var(--stroke-divider)] pt-4">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <MailPlus className="h-4 w-4" /> Invite a member
            </h3>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              Invitations expire after seven days. Owner access is transferred separately.
            </p>
          </div>
          <form
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]"
            onSubmit={(event) => void createInvitation(event)}
          >
            <Input
              type="email"
              aria-label="Invitee email"
              placeholder="member@example.com"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              required
            />
            <Select
              value={inviteRole}
              onValueChange={(role) => setInviteRole(role as NamespaceMemberRole)}
            >
              <SelectTrigger className="w-full" aria-label="Invitation role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEMBER_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={isInviting || !inviteEmail.trim()}>
              {isInviting && <Loader2 className="h-4 w-4 animate-spin" />}
              Invite
            </Button>
          </form>

          {invitationToken && (
            <div className="flex items-center gap-2 rounded-xl bg-[var(--surface-secondary)] p-3">
              <code className="min-w-0 flex-1 truncate text-xs">{invitationToken}</code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void copyInvitationToken()}
              >
                <Copy className="h-3.5 w-3.5" /> Copy token
              </Button>
            </div>
          )}

          {(invitationsQuery.data?.invitations ?? [])
            .filter((invitation) => invitation.status === 'pending')
            .map((invitation) => (
              <div key={invitation.invitation_id} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
                  {invitation.recipient.email ?? invitation.recipient.user_id} · {invitation.role}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busyInvitationId === invitation.invitation_id}
                  onClick={() => void revokeInvitation(invitation.invitation_id)}
                >
                  Revoke
                </Button>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}
