'use client';

import type { ProjectGrant, ProjectGrantRole } from '@t3x-dev/api-client';
import { Copy, Loader2, MailPlus, Trash2, UserRoundCog } from 'lucide-react';
import { useState } from 'react';
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
import { buildInvitationUrl } from '@/domain/collaboration/invitationLink';
import { formatUserFacingError } from '@/domain/format/errors';
import { useProjectCollaboration } from '@/hooks/accounts/useProjectCollaboration';

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
    revokeInvitation: revokeInvitationCommand,
  } = useProjectCollaboration(projectId);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ProjectGrantRole>('editor');
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);
  const [busyGuestId, setBusyGuestId] = useState<string | null>(null);
  const [busyInvitationId, setBusyInvitationId] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);

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

  async function createInvitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteEmail.trim()) return;
    setIsInviting(true);
    setInvitationUrl(null);
    try {
      const response = await createInvitationCommand(inviteEmail.trim(), inviteRole);
      setInviteEmail('');
      setInvitationUrl(
        response.delivery.mode === 'manual'
          ? buildInvitationUrl(window.location.origin, response.delivery.token)
          : null
      );
      toast.success(
        response.delivery.mode === 'email_queued'
          ? 'Project invitation email queued'
          : 'Project invitation created—copy the one-time link'
      );
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

  async function copyInvitationUrl() {
    if (!invitationUrl) return;
    try {
      await navigator.clipboard.writeText(invitationUrl);
      toast.success('Project invitation link copied');
    } catch {
      toast.error('Could not copy project invitation link');
    }
  }

  return (
    <section className="mt-12 space-y-4 border-t border-[var(--stroke-divider)] pt-8">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]">
          <UserRoundCog className="h-5 w-5" /> Project access
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Grant access to this project without adding someone to the whole workspace.
        </p>
      </div>

      {guestsQuery.error ? (
        <p className="text-sm text-destructive">
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
                      <SelectContent>
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
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                <MailPlus className="h-4 w-4" /> Invite a project guest
              </h3>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                The invitation expires after seven days and grants access only to this project.
              </p>
            </div>
            <form
              className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]"
              onSubmit={(event) => void createInvitation(event)}
            >
              <Input
                type="email"
                aria-label="Project invitee email"
                placeholder="guest@example.com"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                required
              />
              <Select
                value={inviteRole}
                onValueChange={(role) => setInviteRole(role as ProjectGrantRole)}
              >
                <SelectTrigger className="w-full" aria-label="Project invitation role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_ROLES.map((role) => (
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

            {invitationUrl && (
              <div className="flex items-center gap-2 rounded-xl bg-[var(--surface-secondary)] p-3">
                <code className="min-w-0 flex-1 truncate text-xs">{invitationUrl}</code>
                <Button type="button" variant="outline" size="sm" onClick={copyInvitationUrl}>
                  <Copy className="h-3.5 w-3.5" /> Copy link
                </Button>
              </div>
            )}

            {invitationsQuery.error && (
              <p className="text-sm text-destructive">
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
        </>
      ) : null}
    </section>
  );
}
