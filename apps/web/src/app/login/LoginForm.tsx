'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, type MouseEvent, useEffect, useState } from 'react';
import { AccountEntry } from '@/components/onboarding/AccountEntry';
import entryStyles from '@/components/onboarding/AccountEntry.module.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useClipboard } from '@/hooks/shared/useClipboard';
import { type LocalAuthMode, useLocalAuth } from '@/hooks/shared/useLocalAuth';
import { useSessionUserId } from '@/hooks/shared/useSession';

export function LoginForm({
  callbackUrl,
  mode,
  agentConsent,
}: {
  callbackUrl: string;
  mode: LocalAuthMode;
  agentConsent: boolean;
}) {
  const router = useRouter();
  const registering = mode === 'register';
  const { authenticate, persistSession, getErrorMessage, destinationAfterLogin } = useLocalAuth();
  const { copy } = useClipboard();
  const [copyFeedback, setCopyFeedback] = useState('');
  const sessionUserId = useSessionUserId();

  // A sign-in in another tab updates the local profile. Only the server can confirm the session.
  useEffect(() => {
    if (agentConsent && sessionUserId) router.refresh();
  }, [agentConsent, sessionUserId, router]);

  useEffect(() => {
    if (!agentConsent) return;
    // Another tab may have signed in while this authorization request was open.
    const recheck = () => router.refresh();
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) recheck();
    };
    window.addEventListener('focus', recheck);
    window.addEventListener('pageshow', onShow);
    return () => {
      window.removeEventListener('focus', recheck);
      window.removeEventListener('pageshow', onShow);
    };
  }, [agentConsent, router]);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<{ mode: LocalAuthMode; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  function modeHref(nextMode: LocalAuthMode) {
    const params = new URLSearchParams();
    if (nextMode === 'register') params.set('mode', 'register');
    if (callbackUrl !== '/') params.set('callbackUrl', callbackUrl);
    return params.size ? `/login?${params}` : '/login';
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      const session = await authenticate({ mode, username, password, name });

      // The session credential stays in the BFF's HttpOnly cookie.
      persistSession(session);
      router.push(await destinationAfterLogin(mode, callbackUrl));
    } catch (cause) {
      setError({ mode, message: getErrorMessage(cause) });
    } finally {
      setLoading(false);
    }
  }

  function handleModeLink(event: MouseEvent<HTMLAnchorElement>) {
    if (loading) event.preventDefault();
    else setError(null);
  }

  const alternateMode = registering ? 'login' : 'register';

  return (
    <AccountEntry
      kind={mode}
      title={registering ? 'Create an account' : 'Sign in'}
      navigation={
        <nav aria-label="Account access" className="flex flex-wrap justify-end gap-1">
          {(['login', 'register'] as const).map((option) => (
            <Link
              key={option}
              href={modeHref(option)}
              aria-current={mode === option ? 'page' : undefined}
              aria-disabled={loading || undefined}
              onClick={handleModeLink}
              className="inline-flex min-h-8 items-center rounded-md px-2 text-[13px] font-medium hover:bg-[var(--hover-bg)] focus-visible:outline-2 focus-visible:outline-[var(--ring)] aria-[current=page]:bg-[var(--management-control-bg)] pointer-coarse:min-h-11"
            >
              {option === 'login' ? 'Sign in' : 'Create account'}
            </Link>
          ))}
        </nav>
      }
    >
      {agentConsent && (
        <div className="mb-4 space-y-1 text-sm">
          <p>Already signed in elsewhere? Open this request in that browser.</p>
          <button
            type="button"
            className={entryStyles.modeLink}
            onClick={async () => {
              const copied = await copy(new URL(callbackUrl, window.location.origin).href);
              setCopyFeedback(copied ? 'Link copied.' : 'Copy the address of this page instead.');
            }}
          >
            Copy authorization link
          </button>
          <output className="ml-2">{copyFeedback}</output>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="username" className="text-sm font-medium">
            Username
          </label>
          <Input
            id="username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            minLength={registering ? 2 : 1}
            maxLength={32}
            autoCapitalize="none"
            autoComplete="username"
            spellCheck={false}
            className="h-9 pointer-coarse:h-11"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={registering ? 6 : 1}
            maxLength={128}
            autoComplete={registering ? 'new-password' : 'current-password'}
            aria-describedby={registering ? 'password-hint' : undefined}
            className="h-9 pointer-coarse:h-11"
          />
          {registering && (
            <p id="password-hint" className="text-xs text-[var(--text-secondary)]">
              Use at least 6 characters.
            </p>
          )}
        </div>

        {registering && (
          <div className="space-y-1.5">
            <label htmlFor="name" className="text-sm font-medium">
              Display name{' '}
              <span className="font-normal text-[var(--text-secondary)]">(optional)</span>
            </label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={64}
              autoComplete="name"
              className="h-9 pointer-coarse:h-11"
            />
          </div>
        )}

        {error?.mode === mode && (
          <p
            role="alert"
            className="rounded-md bg-[var(--status-error-muted)] px-3 py-2 text-sm text-[var(--status-error)]"
          >
            {error.message}
          </p>
        )}

        <Button type="submit" disabled={loading} className="h-9 w-full pointer-coarse:h-11">
          {registering
            ? loading
              ? 'Creating account…'
              : 'Create account'
            : loading
              ? 'Signing in…'
              : 'Sign in'}
        </Button>
      </form>
      <p className="mt-3.5 text-center text-[13px] text-[var(--text-secondary)]">
        {registering ? 'Already have an account?' : 'New to T3X?'}{' '}
        <Link
          href={modeHref(alternateMode)}
          aria-disabled={loading || undefined}
          onClick={handleModeLink}
          className={`${entryStyles.modeLink} focus-visible:outline-2 focus-visible:outline-[var(--ring)]`}
        >
          {registering ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
    </AccountEntry>
  );
}
