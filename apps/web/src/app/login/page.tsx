'use client';

/**
 * Login Page (Local Auth)
 *
 * Username + password login/register for self-hosted deployments.
 * On success, stores API key in cookie and redirects to home.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useLocalAuth } from '@/hooks/shared/useLocalAuth';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const { authenticate, persistSession, getErrorMessage } = useLocalAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const session = await authenticate({ mode, username, password, name });

      // MCP callback: redirect token to local MCP server instead of storing cookie
      const mcpCallback = searchParams.get('mcp_callback');
      const state = searchParams.get('state');

      if (mcpCallback && state) {
        try {
          const callbackTarget = new URL(mcpCallback);
          if (callbackTarget.hostname !== '127.0.0.1' && callbackTarget.hostname !== 'localhost') {
            setError('Invalid callback address: only localhost is allowed');
            return;
          }
          callbackTarget.searchParams.set('token', session.api_key);
          callbackTarget.searchParams.set('state', state);
          window.location.href = callbackTarget.toString();
        } catch {
          setError('Invalid callback URL');
        }
        return;
      }

      // Normal flow: store session and redirect
      persistSession(session);
      router.push(callbackUrl);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm space-y-6 px-4">
      {/* Logo & Title */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">T3X</h1>
        <p className="text-sm text-muted-foreground">Version control for structured state</p>
      </div>

      {/* Mode Toggle */}
      <div className="flex rounded-md border border-border overflow-hidden">
        <button
          type="button"
          onClick={() => {
            setMode('login');
            setError('');
          }}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            mode === 'login'
              ? 'bg-accent text-accent-foreground'
              : 'bg-card text-muted-foreground hover:text-card-foreground'
          }`}
        >
          Login
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('register');
            setError('');
          }}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            mode === 'register'
              ? 'bg-accent text-accent-foreground'
              : 'bg-card text-muted-foreground hover:text-card-foreground'
          }`}
        >
          Register
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="username" className="text-sm font-medium text-foreground">
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={mode === 'register' ? 2 : 1}
            maxLength={32}
            autoComplete="username"
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Enter username"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-foreground">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === 'register' ? 6 : 1}
            maxLength={128}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder={mode === 'register' ? 'At least 6 characters' : 'Enter password'}
          />
        </div>

        {mode === 'register' && (
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium text-foreground">
              Display Name <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              autoComplete="name"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="How others see you"
            />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none"
        >
          {loading
            ? mode === 'login'
              ? 'Signing in...'
              : 'Creating account...'
            : mode === 'login'
              ? 'Sign In'
              : 'Create Account'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
