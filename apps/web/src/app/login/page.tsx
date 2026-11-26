import { redirect } from 'next/navigation';
import { safeAuthCallbackUrl } from '@/domain/authCallback';
import { hasHumanWebSession } from '@/server/browserApiProxy';
import { LoginForm } from './LoginForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const callbackUrl = safeAuthCallbackUrl(
    typeof params.callbackUrl === 'string' ? params.callbackUrl : null
  );
  const mode = params.mode === 'register' ? 'register' : 'login';
  const agentConsent =
    mode === 'login' && callbackUrl.split(/[?#]/, 1)[0] === '/settings/agent-access/authorize';

  if (agentConsent && (await hasHumanWebSession())) redirect(callbackUrl);

  return (
    <main className="bg-[var(--surface-app)]">
      <LoginForm mode={mode} callbackUrl={callbackUrl} agentConsent={agentConsent} />
    </main>
  );
}
