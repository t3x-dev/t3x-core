'use client';

import type { AcceptCollaborationInvitationResponse } from '@t3x-dev/api-client';
import { CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  invitationTokenFromHash,
  PENDING_INVITATION_TOKEN_KEY,
} from '@/domain/collaboration/invitationLink';
import { formatUserFacingError } from '@/domain/format/errors';
import { useInvitationAcceptance } from '@/hooks/accounts/useInvitationAcceptance';
import { useSession } from '@/hooks/shared/useSession';

type AcceptanceState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'accepted'; response: AcceptCollaborationInvitationResponse };

export function InvitationAcceptancePage() {
  const router = useRouter();
  const { getKey } = useSession();
  const { acceptInvitation } = useInvitationAcceptance();
  const attempted = useRef(false);
  const [state, setState] = useState<AcceptanceState>({ kind: 'loading' });

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const hashToken = invitationTokenFromHash(window.location.hash);
    if (hashToken) {
      sessionStorage.setItem(PENDING_INVITATION_TOKEN_KEY, hashToken);
      window.history.replaceState(window.history.state, '', '/invite');
    }

    const token = hashToken ?? sessionStorage.getItem(PENDING_INVITATION_TOKEN_KEY);
    if (!token) {
      setState({ kind: 'error', message: 'This invitation link is missing or invalid.' });
      return;
    }

    const authDisabled = process.env.NEXT_PUBLIC_AUTH_DISABLED?.toLowerCase() === 'true';
    if (!authDisabled && !getKey()) {
      router.replace('/login?callbackUrl=%2Finvite');
      return;
    }

    void acceptInvitation(token)
      .then((response) => setState({ kind: 'accepted', response }))
      .catch((error: unknown) =>
        setState({
          kind: 'error',
          message: formatUserFacingError(
            error,
            'This invitation could not be accepted. It may be expired, revoked, or already used.'
          ),
        })
      )
      .finally(() => sessionStorage.removeItem(PENDING_INVITATION_TOKEN_KEY));
  }, [acceptInvitation, getKey, router]);

  let content: React.ReactNode;
  if (state.kind === 'loading') {
    content = (
      <div className="flex items-center justify-center gap-2 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Accepting invitation
      </div>
    );
  } else if (state.kind === 'error') {
    content = (
      <>
        <ShieldAlert className="mx-auto h-9 w-9 text-destructive" />
        <h1 className="text-center text-xl font-semibold text-[var(--text-primary)]">
          Invitation unavailable
        </h1>
        <p className="text-center text-sm text-[var(--text-secondary)]">{state.message}</p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/">Return to projects</Link>
        </Button>
      </>
    );
  } else {
    const authority = state.response.authority;
    const projectId = authority.kind === 'project_grant' ? authority.grant.project_id : null;
    content = (
      <>
        <CheckCircle2 className="mx-auto h-9 w-9 text-[var(--status-success)]" />
        <h1 className="text-center text-xl font-semibold text-[var(--text-primary)]">
          Invitation accepted
        </h1>
        <p className="text-center text-sm text-[var(--text-secondary)]">
          {authority.kind === 'namespace_membership'
            ? `You joined the workspace as ${authority.membership.role}.`
            : `You now have ${authority.grant.role} access to the project.`}
        </p>
        <Button asChild className="w-full">
          <Link href={projectId ? `/project/${projectId}` : '/settings/access'}>
            {projectId ? 'Open project' : 'View workspace access'}
          </Link>
        </Button>
      </>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-primary)] p-6 shadow-sm">
        {content}
      </section>
    </div>
  );
}

export default function InvitePage() {
  return <InvitationAcceptancePage />;
}
