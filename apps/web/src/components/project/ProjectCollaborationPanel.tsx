'use client';

import type {
  CollaborationUserSearchResult,
  ProjectGrant,
  ProjectGrantRole,
} from '@t3x-dev/api-client';
import { Loader2, Search, Trash2, UserPlus, UserRoundCog } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatUserFacingError } from '@/domain/format/errors';
import { useProjectCollaboration } from '@/hooks/accounts/useProjectCollaboration';
import palette from '@/styles/management-palette.module.css';
import { SettingsSection } from './settings/SettingsSection';

const PROJECT_ROLES: readonly ProjectGrantRole[] = ['admin', 'editor', 'viewer'];

function isForbidden(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      ((error as { status?: unknown }).status === 403 ||
        (error as { code?: unknown }).code === 'FORBIDDEN')
  );
}

function principalLabel(guest: ProjectGrant): string {
  if (guest.principal.kind === 'human') {
    return guest.principal.display_name ?? guest.principal.email ?? guest.principal.principal_id;
  }
  return guest.principal.display_name ?? guest.principal.principal_id;
}

export function ProjectCollaborationPanel({ projectId }: { projectId: string }) {
  const {
    guestsQuery,
    invitationsQuery,
    canManageGuests,
    updateGuestRole,
    revokeGuest: revokeGuestCommand,
    createInvitation: createInvitationCommand,
    searchUsers,
    revokeInvitation: revokeInvitationCommand,
  } = useProjectCollaboration(projectId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteResults, setInviteResults] = useState<CollaborationUserSearchResult[]>([]);
  const [selectedInvitee, setSelectedInvitee] = useState<CollaborationUserSearchResult | null>(
    null
  );
  const [inviteRole, setInviteRole] = useState<ProjectGrantRole>('editor');
  const [isSearching, setIsSearching] = useState(false);
  const [busyGuestId, setBusyGuestId] = useState<string | null>(null);
  const [busyInvitationId, setBusyInvitationId] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);

  useEffect(() => {
    if (!inviteOpen || selectedInvitee || inviteQuery.trim().length < 2) {
      setInviteResults([]);
      setIsSearching(false);
      return;
    }
    let active = true;
    setIsSearching(true);
    const timeout = window.setTimeout(() => {
      void searchUsers(inviteQuery.trim())
        .then((users) => {
          if (active) setInviteResults(users);
        })
        .catch((error) => {
          if (active) toast.error(formatUserFacingError(error, 'Failed to search users.'));
        })
        .finally(() => {
          if (active) setIsSearching(false);
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [inviteOpen, inviteQuery, searchUsers, selectedInvitee]);

  if (isForbidden(guestsQuery.error)) return null;

  async function changeGuestRole(guest: ProjectGrant, role: ProjectGrantRole) {
    if (guest.role === role) return;
    setBusyGuestId(guest.grant_id);
    try {
      await updateGuestRole(guest, role);
      toast.success('Project guest role updated');
    } catch (error) {
      toast.error(formatUserFacingError(error, 'Failed to update project guest.'));
    } finally {
      setBusyGuestId(null);
    }
  }

  async function revokeGuest(guest: ProjectGrant) {
    if (!window.confirm(`Remove ${principalLabel(guest)} from this project?`)) return;
    setBusyGuestId(guest.grant_id);
    try {
      await revokeGuestCommand(guest.grant_id);
      toast.success('Project guest removed');
    } catch (error) {
      toast.error(formatUserFacingError(error, 'Failed to remove project guest.'));
    } finally {
      setBusyGuestId(null);
    }
  }

  async function createInvitation() {
    if (!selectedInvitee) return;
    setIsInviting(true);
    try {
      await createInvitationCommand(selectedInvitee.user_id, inviteRole);
      toast.success(`Invitation sent to @${selectedInvitee.username}`);
      setInviteOpen(false);
      setInviteQuery('');
      setSelectedInvitee(null);
    } catch (error) {
      toast.error(formatUserFacingError(error, 'Failed to create project invitation.'));
    } finally {
      setIsInviting(false);
    }
  }

  async function revokeInvitation(invitationId: string) {
    if (!window.confirm('Revoke this pending project invitation?')) return;
    setBusyInvitationId(invitationId);
    try {
      await revokeInvitationCommand(invitationId);
      toast.success('Project invitation revoked');
    } catch (error) {
      toast.error(formatUserFacingError(error, 'Failed to revoke project invitation.'));
    } finally {
      setBusyInvitationId(null);
    }
  }

  return (
    <SettingsSection
      description="Grant access to this project without adding someone to the whole workspace."
      icon={UserRoundCog}
      id="access"
      title="Project access"
    >
      <div className="space-y-4">
        {guestsQuery.error ? (
          <p className="text-sm text-[var(--status-error)]">
            {formatUserFacingError(guestsQuery.error, 'Failed to load project guests.')}
          </p>
        ) : guestsQuery.isLoading && !guestsQuery.data ? (
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking project access
          </div>
        ) : canManageGuests ? (
          <>
            <div className="divide-y divide-[var(--stroke-divider)] rounded-xl border border-[var(--stroke-divider)] px-4">
              {(guestsQuery.data?.guests ?? []).filter((guest) => guest.status === 'active')
                .length === 0 ? (
                <p className="py-4 text-sm text-[var(--text-tertiary)]">No project-only guests.</p>
              ) : (
                (guestsQuery.data?.guests ?? [])
                  .filter((guest) => guest.status === 'active')
                  .map((guest) => (
                    <div key={guest.grant_id} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                          {principalLabel(guest)}
                        </p>
                        <p className="truncate text-xs text-[var(--text-tertiary)]">
                          Project-only access
                          {guest.expires_at
                            ? ` · expires ${new Date(guest.expires_at).toLocaleDateString()}`
                            : ''}
                        </p>
                      </div>
                      <Select
                        value={guest.role}
                        disabled={busyGuestId === guest.grant_id}
                        onValueChange={(role) =>
                          void changeGuestRole(guest, role as ProjectGrantRole)
                        }
                      >
                        <SelectTrigger className="w-28" size="sm" aria-label="Project guest role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className={palette.scope}>
                          {PROJECT_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${principalLabel(guest)}`}
                        disabled={busyGuestId === guest.grant_id}
                        onClick={() => void revokeGuest(guest)}
                      >
                        {busyGuestId === guest.grant_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ))
              )}
            </div>

            <div className="space-y-3 rounded-xl border border-[var(--stroke-divider)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Manage access
                  </h3>
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                    Invite registered users to collaborate on this project.
                  </p>
                </div>
                <Button type="button" size="sm" onClick={() => setInviteOpen(true)}>
                  <UserPlus className="h-4 w-4" /> Add people
                </Button>
              </div>

              <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add people to this project</DialogTitle>
                    <DialogDescription>
                      Search by username or display name, then choose a role.
                    </DialogDescription>
                  </DialogHeader>
                  {selectedInvitee ? (
                    <button
                      type="button"
                      className="flex items-center gap-3 rounded-xl border border-[var(--accent-branch)] bg-[var(--accent-branch)]/10 p-3 text-left"
                      onClick={() => setSelectedInvitee(null)}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-tertiary)] text-sm font-semibold">
                        {(selectedInvitee.display_name ??
                          selectedInvitee.username)[0]?.toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {selectedInvitee.display_name ?? selectedInvitee.username}
                        </span>
                        <span className="block truncate text-xs text-[var(--text-tertiary)]">
                          @{selectedInvitee.username}
                        </span>
                      </span>
                      <span className="text-xs text-[var(--text-tertiary)]">Change</span>
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                        <Input
                          autoFocus
                          aria-label="Search users"
                          className="pl-9"
                          placeholder="Search by username or display name"
                          value={inviteQuery}
                          onChange={(event) => setInviteQuery(event.target.value)}
                        />
                      </div>
                      <div className="max-h-64 overflow-y-auto rounded-xl border border-[var(--stroke-divider)]">
                        {isSearching ? (
                          <p className="flex items-center justify-center gap-2 p-4 text-sm text-[var(--text-secondary)]">
                            <Loader2 className="h-4 w-4 animate-spin" /> Searching
                          </p>
                        ) : inviteQuery.trim().length < 2 ? (
                          <p className="p-4 text-sm text-[var(--text-tertiary)]">
                            Type at least two characters.
                          </p>
                        ) : inviteResults.length === 0 ? (
                          <p className="p-4 text-sm text-[var(--text-tertiary)]">No users found.</p>
                        ) : (
                          inviteResults.map((user) => (
                            <button
                              key={user.user_id}
                              type="button"
                              className="flex w-full items-center gap-3 border-b border-[var(--stroke-divider)] p-3 text-left last:border-b-0 hover:bg-[var(--hover-bg)]"
                              onClick={() => setSelectedInvitee(user)}
                            >
                              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-tertiary)] text-sm font-semibold">
                                {(user.display_name ?? user.username)[0]?.toUpperCase()}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium">
                                  {user.display_name ?? user.username}
                                </span>
                                <span className="block truncate text-xs text-[var(--text-tertiary)]">
                                  @{user.username} · Invite collaborator
                                </span>
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                  <DialogFooter>
                    <Select
                      value={inviteRole}
                      onValueChange={(role) => setInviteRole(role as ProjectGrantRole)}
                    >
                      <SelectTrigger className="w-28" aria-label="Project invitation role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className={palette.scope}>
                        {PROJECT_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      disabled={!selectedInvitee || isInviting}
                      onClick={() => void createInvitation()}
                    >
                      {isInviting && <Loader2 className="h-4 w-4 animate-spin" />}
                      {selectedInvitee ? `Add @${selectedInvitee.username}` : 'Add to project'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {invitationsQuery.error && (
                <p className="text-sm text-[var(--status-error)]">
                  {formatUserFacingError(
                    invitationsQuery.error,
                    'Failed to load project invitations.'
                  )}
                </p>
              )}
              {(invitationsQuery.data?.invitations ?? [])
                .filter((invitation) => invitation.status === 'pending')
                .map((invitation) => (
                  <div key={invitation.invitation_id} className="flex items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
                      {invitation.recipient.email ?? invitation.recipient.user_id} ·{' '}
                      {invitation.role}
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
          </>
        ) : (
          <p className="text-[13px] text-[var(--text-secondary)]">
            Only project administrators can view and manage project guests.
          </p>
        )}
      </div>
    </SettingsSection>
  );
}
