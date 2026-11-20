'use client';

import type { ReceivedCollaborationInvitation } from '@t3x-dev/api-client';
import { CheckCircle2, Inbox, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatUserFacingError } from '@/domain/format/errors';
import { getSharedApiClient } from '@/infrastructure/sharedApiClient';

function invitationTarget(item: ReceivedCollaborationInvitation): string {
  return item.project ? `${item.namespace.slug}/${item.project.name}` : item.namespace.display_name;
}

function invitationHref(item: ReceivedCollaborationInvitation): string {
  return item.project
    ? `/${encodeURIComponent(item.namespace.slug)}/${encodeURIComponent(item.project.name)}`
    : '/settings/access';
}

export function InvitationsPageContent() {
  const client = getSharedApiClient();
  const [invitations, setInvitations] = useState<ReceivedCollaborationInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actions, setActions] = useState<Record<string, { error?: string } | undefined>>({});
  const [accepted, setAccepted] = useState<ReceivedCollaborationInvitation | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInvitations((await client.listReceivedCollaborationInvitations()).invitations);
    } catch (loadError) {
      setError(formatUserFacingError(loadError, 'Failed to load invitations.'));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function accept(item: ReceivedCollaborationInvitation) {
    const id = item.invitation.invitation_id;
    setActions((current) => ({ ...current, [id]: {} }));
    try {
      await client.acceptCollaborationInvitationById(item.invitation.invitation_id);
      setInvitations((current) =>
        current.filter(
          (candidate) => candidate.invitation.invitation_id !== item.invitation.invitation_id
        )
      );
      setAccepted(item);
      setActions((current) => ({ ...current, [id]: undefined }));
      toast.success('Invitation accepted');
    } catch (acceptError) {
      setActions((current) => ({
        ...current,
        [id]: { error: formatUserFacingError(acceptError, 'Failed to accept invitation.') },
      }));
    }
  }

  async function decline(item: ReceivedCollaborationInvitation) {
    const id = item.invitation.invitation_id;
    setActions((current) => ({ ...current, [id]: {} }));
    try {
      await client.declineCollaborationInvitation(item.invitation.invitation_id);
      setInvitations((current) =>
        current.filter(
          (candidate) => candidate.invitation.invitation_id !== item.invitation.invitation_id
        )
      );
      setActions((current) => ({ ...current, [id]: undefined }));
      toast.success('Invitation declined');
    } catch (declineError) {
      setActions((current) => ({
        ...current,
        [id]: { error: formatUserFacingError(declineError, 'Failed to decline invitation.') },
      }));
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Invitations</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Review invitations to collaborate on projects and workspaces.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/repositories">Back to repositories</Link>
          </Button>
        </div>

        {accepted && (
          <section className="flex items-center gap-3 rounded-2xl border border-[var(--status-success)]/30 bg-[var(--status-success)]/10 p-4">
            <CheckCircle2 className="h-5 w-5 text-[var(--status-success)]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Invitation accepted</p>
              <p className="truncate text-xs text-[var(--text-secondary)]">
                You can now collaborate on {invitationTarget(accepted)}.
              </p>
            </div>
            <Button asChild size="sm">
              <Link href={invitationHref(accepted)}>Open project</Link>
            </Button>
          </section>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--stroke-divider)] p-12 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading invitations
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-[var(--status-error)]/30 p-6 text-sm text-[var(--status-error)]">
            <p>{error}</p>
            <Button className="mt-4" size="sm" variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : invitations.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--stroke-divider)] p-12 text-center">
            <Inbox className="h-9 w-9 text-[var(--text-tertiary)]" />
            <h2 className="mt-3 text-base font-semibold">No pending invitations</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              New collaboration invitations will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {invitations.map((item) => {
              const action = actions[item.invitation.invitation_id];
              const busy = Boolean(action && !action.error);
              return (
                <section
                  key={item.invitation.invitation_id}
                  className="rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-primary)] p-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[var(--text-secondary)]">
                        You were invited to collaborate on
                      </p>
                      <h2 className="mt-1 truncate text-lg font-semibold text-[var(--text-primary)]">
                        {invitationTarget(item)}
                      </h2>
                      <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                        {item.invitation.role} access · expires{' '}
                        {new Date(item.invitation.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button disabled={busy} onClick={() => void accept(item)}>
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Accept invitation
                      </Button>
                      <Button disabled={busy} variant="outline" onClick={() => void decline(item)}>
                        <X className="h-4 w-4" /> Decline
                      </Button>
                    </div>
                  </div>
                  {action?.error && (
                    <p className="mt-3 break-words text-sm text-[var(--status-error)]" role="alert">
                      {action.error}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

export default function InvitationsPage() {
  if (process.env.NEXT_PUBLIC_AUTH_DISABLED?.toLowerCase() === 'true') redirect('/repositories');
  return <InvitationsPageContent />;
}
