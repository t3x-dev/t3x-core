/**
 * NextAuth.js v5 Configuration
 *
 * GitHub OAuth + JWT strategy.
 * On first login, creates/finds user via T3X API and provisions a session API key.
 * JWT contains userId + apiKey for downstream API calls.
 *
 * When AUTH_DISABLED=true, this module is not used — middleware skips auth.
 */

import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],

  session: {
    strategy: 'jwt',
  },

  pages: {
    signIn: '/login',
  },

  callbacks: {
    /**
     * JWT callback — runs on every token creation/refresh.
     *
     * On initial sign-in (when `account` is present):
     * - Calls T3X API to find or create user
     * - Stores userId and apiKey in the JWT token
     *
     * On subsequent requests: token already has userId/apiKey, no API call.
     */
    async jwt({ token, account, profile }) {
      if (account && profile) {
        // First-time login — create/find user via T3X API
        try {
          // Server-side: prefer T3X_API_URL (runtime, for Docker inter-container networking)
          // Fallback to NEXT_PUBLIC_API_URL (build-time, for local dev)
          const apiUrl =
            process.env.T3X_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
          const res = await fetch(`${apiUrl}/api/v1/auth/callback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: account.provider,
              provider_id: account.providerAccountId,
              email: profile.email ?? null,
              email_verified:
                (profile as Record<string, unknown>).email_verified === true,
              name:
                profile.name ??
                ((profile as Record<string, unknown>).login as string | undefined) ??
                null,
              avatar_url:
                ((profile as Record<string, unknown>).avatar_url as string | undefined) ??
                ((profile as Record<string, unknown>).picture as string | undefined) ??
                null,
            }),
          });

          if (res.ok) {
            const data = (await res.json()) as {
              success: boolean;
              data: { id: string; api_key: string };
            };
            if (data.success) {
              token.userId = data.data.id;
              token.apiKey = data.data.api_key;
            }
          } else {
            console.error('Auth callback failed:', res.status, await res.text());
          }
        } catch (error) {
          console.error('Auth callback error:', error);
        }

        // Fallback: store provider info for later resolution
        if (!token.userId) {
          token.provider = account.provider;
          token.providerAccountId = account.providerAccountId;
        }

        token.name =
          profile.name ??
          ((profile as Record<string, unknown>).login as string | undefined) ??
          null;
        token.email = profile.email ?? null;
        token.picture =
          ((profile as Record<string, unknown>).avatar_url as string | undefined) ??
          ((profile as Record<string, unknown>).picture as string | undefined) ??
          undefined;
      }

      return token;
    },

    /**
     * Session callback — shapes what's exposed to the client.
     *
     * Exposes userId and apiKey so the WebUI can authenticate API requests.
     */
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      if (token.apiKey) {
        (session as unknown as Record<string, unknown>).apiKey = token.apiKey;
      }
      return session;
    },
  },
});
