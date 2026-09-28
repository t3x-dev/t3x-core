'use client';

import type {
  NamespaceCollaborationInvitation,
  NamespaceMemberRole,
  NamespaceMembership,
} from '@t3x-dev/api-client';
import {
  Building2,
  ChevronDown,
  Copy,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { buildInvitationUrl } from '@/domain/collaboration/invitationLink';
import { formatUserFacingError } from '@/domain/format/errors';
import { useNamespaceAccounts } from '@/hooks/accounts/useNamespaceAccounts';
import { useNamespaceCollaboration } from '@/hooks/accounts/useNamespaceCollaboration';
import styles from './MembersSettingsPanel.module.css';

const MEMBER_ROLES: readonly NamespaceMemberRole[] = ['admin', 'editor', 'viewer'];

function memberName(member: NamespaceMembership): string {
  return (
    member.principal.display_name ??
    (member.principal.kind === 'human' ? member.principal.email : null) ??
    member.principal.principal_id
  );
}

function memberEmail(member: NamespaceMembership): string | null {
  return member.principal.kind === 'human' ? member.principal.email : null;
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/u);
  if (parts.length > 1) return `${parts[0]?.[0] ?? ''}${parts.at(-1)?.[0] ?? ''}`.toUpperCase();
  return value.slice(0, 2).toUpperCase();
}

function titleCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function relativeDate(value: string): string {
  const elapsed = Date.now() - Date.parse(value);
  const days = Math.max(0, Math.floor(elapsed / 86_400_000));
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
}

function InviteDialog({
  open,
  busy,
  onClose,
  onInvite,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onInvite: (email: string, role: NamespaceMemberRole) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<NamespaceMemberRole>('editor');

  useEffect(() => {
    if (!open) {
      setEmail('');
      setRole('editor');
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className={styles.dialogBackdrop} role="presentation" onMouseDown={onClose}>
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-member-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h2 id="invite-member-title">Invite member</h2>
            <p>Invite someone to join this organization.</p>
          </div>
          <button type="button" aria-label="Close invitation dialog" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onInvite(email.trim(), role);
          }}
        >
          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              required
            />
          </label>
          <label>
            Role
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as NamespaceMemberRole)}
            >
              {MEMBER_ROLES.map((value) => (
                <option key={value} value={value}>
                  {titleCase(value)}
                </option>
              ))}
            </select>
          </label>
          <footer>
            <button type="button" className={styles.dialogCancel} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.dialogSubmit} disabled={busy || !email.trim()}>
              {busy ? <Loader2 size={16} className={styles.spin} /> : null}
              Send invitation
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export function MembersSettingsPanel() {
  const {
    activeAccount,
    isLoading: accountsLoading,
    error: accountsError,
  } = useNamespaceAccounts();
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
    revokeMember,
    createInvitation,
    revokeInvitation,
  } = useNamespaceCollaboration({ namespaceId, canReadMembers, canManageInvitations });
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [menuMemberId, setMenuMemberId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);

  const members = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (membersQuery.data?.members ?? []).filter((member) => {
      const matchesRole = roleFilter === 'all' || member.role === roleFilter;
      const haystack = `${memberName(member)} ${memberEmail(member) ?? ''}`.toLowerCase();
      return matchesRole && (!query || haystack.includes(query));
    });
  }, [membersQuery.data?.members, roleFilter, search]);

  const invitations = (invitationsQuery.data?.invitations ?? []).filter(
    (invitation) => invitation.status === 'pending'
  );
  const organizationName = activeAccount?.namespace.display_name ?? 'orbit-labs';
  const loading = accountsLoading || membersQuery.isLoading;
  const error = accountsError ?? membersQuery.error;

  async function invite(email: string, role: NamespaceMemberRole) {
    setInviteBusy(true);
    try {
      const response = await createInvitation(email, role);
      if (!response) return;
      if (response.delivery.mode === 'manual') {
        const url = buildInvitationUrl(window.location.origin, response.delivery.token);
        setInvitationUrl(url);
        await navigator.clipboard.writeText(url).catch(() => undefined);
        toast.success('Invitation created and link copied');
      } else {
        toast.success('Invitation email queued');
      }
      setInviteOpen(false);
    } catch (cause) {
      toast.error(formatUserFacingError(cause, 'Failed to create invitation.'));
    } finally {
      setInviteBusy(false);
    }
  }

  async function changeRole(member: NamespaceMembership, role: NamespaceMemberRole) {
    setBusyId(member.membership_id);
    try {
      await updateMemberRole(member, role);
      setMenuMemberId(null);
      toast.success('Member role updated');
    } catch (cause) {
      toast.error(formatUserFacingError(cause, 'Failed to update member role.'));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(member: NamespaceMembership) {
    if (!window.confirm(`Remove ${memberName(member)} from this organization?`)) return;
    setBusyId(member.membership_id);
    try {
      await revokeMember(member.membership_id);
      setMenuMemberId(null);
      toast.success('Member removed');
    } catch (cause) {
      toast.error(formatUserFacingError(cause, 'Failed to remove member.'));
    } finally {
      setBusyId(null);
    }
  }

  async function cancelInvitation(invitation: NamespaceCollaborationInvitation) {
    if (
      !window.confirm(`Cancel the invitation for ${invitation.recipient.email ?? 'this member'}?`)
    )
      return;
    setBusyId(invitation.invitation_id);
    try {
      await revokeInvitation(invitation.invitation_id);
      toast.success('Invitation cancelled');
    } catch (cause) {
      toast.error(formatUserFacingError(cause, 'Failed to cancel invitation.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/settings">Settings</Link>
          <span>/</span>
          <Link href="/settings">{organizationName}</Link>
          <span>/</span>
          <strong>Members</strong>
        </nav>

        <div className={styles.toolbar}>
          <div className={styles.titleGroup}>
            <h1>Members</h1>
            <span className={styles.organizationBadge}>
              <Building2 size={14} />
              Organization
            </span>
          </div>
          <div className={styles.controls}>
            <label className={styles.searchBox}>
              <Search size={18} />
              <input
                type="search"
                aria-label="Search members"
                placeholder="Search members"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label className={styles.roleSelect}>
              <select
                aria-label="Filter by role"
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
              >
                <option value="all">All roles</option>
                <option value="owner">Owner</option>
                {MEMBER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {titleCase(role)}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} />
            </label>
            <button
              type="button"
              className={styles.inviteButton}
              disabled={!canManageInvitations}
              onClick={() => setInviteOpen(true)}
            >
              <Plus size={18} />
              Invite member
            </button>
          </div>
        </div>

        {invitationUrl ? (
          <div className={styles.inviteLink}>
            <span>Invitation link created</span>
            <code>{invitationUrl}</code>
            <button type="button" onClick={() => void navigator.clipboard.writeText(invitationUrl)}>
              <Copy size={14} />
              Copy
            </button>
            <button
              type="button"
              aria-label="Dismiss invitation link"
              onClick={() => setInvitationUrl(null)}
            >
              <X size={14} />
            </button>
          </div>
        ) : null}

        <section className={styles.tableCard} aria-label="Organization members">
          <div className={styles.memberHeader}>
            <span>Member</span>
            <span>Role</span>
            <span>Projects</span>
            <span>Status</span>
            <span>Last active</span>
            <span>Actions</span>
          </div>
          {error ? (
            <div className={styles.emptyState}>
              {formatUserFacingError(error, 'Failed to load members.')}
            </div>
          ) : null}
          {!error && loading ? (
            <div className={styles.emptyState}>
              <Loader2 size={18} className={styles.spin} />
              Loading members
            </div>
          ) : null}
          {!error && !loading && !activeAccount ? (
            <div className={styles.emptyState}>Select an organization to manage its members.</div>
          ) : null}
          {!error && !loading && activeAccount && !canReadMembers ? (
            <div className={styles.emptyState}>
              You do not have permission to view organization members.
            </div>
          ) : null}
          {!error && !loading && canReadMembers && members.length === 0 ? (
            <div className={styles.emptyState}>No members match your filters.</div>
          ) : null}
          {!error && !loading && canReadMembers
            ? members.map((member, index) => {
                const name = memberName(member);
                const email = memberEmail(member);
                const menuOpen = menuMemberId === member.membership_id;
                const manageable = canManageMembers && member.role !== 'owner';
                return (
                  <div className={styles.memberRow} key={member.membership_id}>
                    <div className={styles.identity}>
                      <span className={styles.avatar} data-tone={index % 5}>
                        {initials(name)}
                      </span>
                      <div>
                        <strong>{name}</strong>
                        {email ? <span>{email}</span> : <span>{member.principal.kind}</span>}
                      </div>
                    </div>
                    <span>{titleCase(member.role)}</span>
                    <span>—</span>
                    <span>
                      <i className={styles.status} data-status={member.status}>
                        <b />
                        {titleCase(member.status)}
                      </i>
                    </span>
                    <span title="Activity data is not available">—</span>
                    <div className={styles.actionCell}>
                      <button
                        type="button"
                        className={styles.moreButton}
                        aria-label={`Actions for ${name}`}
                        disabled={!manageable}
                        onClick={() => setMenuMemberId(menuOpen ? null : member.membership_id)}
                      >
                        {busyId === member.membership_id ? (
                          <Loader2 size={17} className={styles.spin} />
                        ) : (
                          <MoreHorizontal size={20} />
                        )}
                      </button>
                      {menuOpen ? (
                        <div className={styles.actionMenu}>
                          <p>Change role</p>
                          {MEMBER_ROLES.map((role) => (
                            <button
                              type="button"
                              key={role}
                              disabled={role === member.role}
                              onClick={() => void changeRole(member, role)}
                            >
                              {titleCase(role)}
                            </button>
                          ))}
                          <button
                            type="button"
                            className={styles.removeAction}
                            onClick={() => void remove(member)}
                          >
                            Remove member
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })
            : null}
        </section>

        <section className={styles.pendingCard} aria-labelledby="pending-title">
          <header>
            <h2 id="pending-title">Pending invitations</h2>
          </header>
          <div className={styles.pendingHeader}>
            <span>Member</span>
            <span>Role</span>
            <span>Invited</span>
            <span>Actions</span>
          </div>
          {invitationsQuery.isLoading ? (
            <div className={styles.emptyState}>
              <Loader2 size={18} className={styles.spin} />
              Loading invitations
            </div>
          ) : null}
          {!invitationsQuery.isLoading && invitations.length === 0 ? (
            <div className={styles.emptyState}>No pending invitations.</div>
          ) : null}
          {!invitationsQuery.isLoading
            ? invitations.map((invitation, index) => {
                const recipient =
                  invitation.recipient.email ?? invitation.recipient.user_id ?? 'Pending member';
                return (
                  <div className={styles.pendingRow} key={invitation.invitation_id}>
                    <div className={styles.identity}>
                      <span className={styles.avatar} data-tone={(index + 1) % 5}>
                        {initials(recipient.split('@')[0] ?? recipient)}
                      </span>
                      <div>
                        <strong>{recipient.split('@')[0]}</strong>
                        <span>{recipient}</span>
                      </div>
                    </div>
                    <span>{titleCase(invitation.role)}</span>
                    <span>{relativeDate(invitation.created_at)}</span>
                    <div className={styles.invitationActions}>
                      <button
                        type="button"
                        disabled
                        title="Resend is not supported by the current API"
                      >
                        Resend
                      </button>
                      <button
                        type="button"
                        className={styles.cancelButton}
                        disabled={busyId === invitation.invitation_id}
                        onClick={() => void cancelInvitation(invitation)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              })
            : null}
        </section>
      </div>

      <InviteDialog
        open={inviteOpen}
        busy={inviteBusy}
        onClose={() => setInviteOpen(false)}
        onInvite={invite}
      />
    </div>
  );
}
