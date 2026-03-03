/**
 * NextAuth.js API Route Handler
 *
 * Handles all /api/auth/* requests (login, callback, session, signout).
 */

import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;
