import { redirect } from 'next/navigation';
import { safeAuthCallbackUrl } from '@/domain/authCallback';
import { isAgentEntry } from '@/domain/mcpDelegation';
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
  const targetPath = callbackUrl.split(/[?#]/, 1)[0];
  const agentEntry = mode === 'login' && isAgentEntry(targetPath);
  if (agentEntry && (await hasHumanWebSession())) redirect(callbackUrl);

  return (
    <main className="bg-[var(--surface-app)]">
      <LoginForm mode={mode} callbackUrl={callbackUrl} agentEntry={agentEntry} />
    </main>
  );
}
