'use client';

/**
 * Device Authorization Page
 *
 * Used in OAuth Device Flow (RFC 8628) for MCP client authentication.
 * User enters the code shown in their terminal to grant access.
 */

import { useState } from 'react';
import { getSessionKey } from '@/lib/session';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function DeviceAuthorizePage() {
  const [userCode, setUserCode] = useState('');
  const [status, setStatus] = useState<'input' | 'confirming' | 'success' | 'error'>('input');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('confirming');
    setErrorMsg('');

    try {
      const sessionKey = getSessionKey();
      if (!sessionKey) {
        window.location.href = '/login?callbackUrl=/device';
        return;
      }

      const res = await fetch(`${API_URL}/api/v1/oauth/device/authorize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionKey}`,
        },
        body: JSON.stringify({ user_code: userCode.toUpperCase().trim() }),
      });

      if (res.ok) {
        setStatus('success');
      } else {
        const data = await res.json();
        setErrorMsg(data.error_description || 'Authorization failed');
        setStatus('error');
      }
    } catch {
      setErrorMsg('Network error');
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-md space-y-6 px-4 text-center">
          <div className="text-6xl">&#x2705;</div>
          <h1 className="text-3xl font-bold tracking-tight">Authorized</h1>
          <p className="text-muted-foreground">
            You can close this page. The agent now has access to your T3X projects.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-6 px-4">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Authorize Device</h1>
          <p className="text-muted-foreground">
            Enter the code shown in your terminal to grant access to your T3X projects.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <input
              type="text"
              value={userCode}
              onChange={(e) => setUserCode(e.target.value.toUpperCase())}
              placeholder="ABCD-1234"
              className="w-full rounded-md border border-border bg-card px-4 py-3 text-center text-2xl tracking-widest text-card-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              maxLength={9}
              required
            />
          </div>

          {status === 'error' && <p className="text-sm text-destructive text-center">{errorMsg}</p>}

          <button
            type="submit"
            disabled={status === 'confirming' || userCode.length < 9}
            className="flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none"
          >
            {status === 'confirming' ? 'Authorizing...' : 'Authorize'}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          This grants read and write access to your semantic knowledge.
          <br />
          You can revoke access at any time from Settings.
        </p>
      </div>
    </div>
  );
}
