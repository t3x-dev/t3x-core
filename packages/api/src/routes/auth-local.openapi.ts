/**
 * Local Auth Routes (Open-Source)
 *
 * Username + password authentication for self-hosted deployments.
 * Generates an API key on successful register/login.
 *
 * Endpoints:
 * - POST /v1/auth/register — Create a new local user
 * - POST /v1/auth/login    — Login with username + password
 */

import { randomBytes } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { API_KEY_VALUE_PREFIX } from '@t3x-dev/core';
import { createApiKey, createLocalUser, findUserByUsername } from '@t3x-dev/storage';
import bcrypt from 'bcryptjs';
import { getDB } from '../lib/db';
import { createError, errorResponse, zodErrorHook } from '../lib/errors';
import { pinoLogger } from '../middleware/logger';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';

// ============================================================
// Auth-specific rate limiting (per-endpoint, stricter than global)
// ============================================================

interface AuthRateLimitEntry {
  count: number;
  resetAt: number;
}

class AuthRateLimiter {
  private store = new Map<string, AuthRateLimitEntry>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs = 60_000) {
    this.limit = limit;
    this.windowMs = windowMs;
    // Cleanup every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store) {
        if (now > entry.resetAt) this.store.delete(key);
      }
    }, 5 * 60_000);
  }

  check(key: string): boolean {
    const now = Date.now();
    const entry = this.store.get(key);
    if (!entry || now > entry.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= this.limit;
  }
}

/** 5 registrations per IP per minute */
const registerLimiter = new AuthRateLimiter(5);
/** 10 login attempts per username per minute */
const loginLimiter = new AuthRateLimiter(10);

export const authLocalRoutes = new OpenAPIHono({
  defaultHook: zodErrorHook,
});

const BCRYPT_ROUNDS = 10;

// ============================================================
// Schemas
// ============================================================

const RegisterRequest = z.object({
  username: z.string().min(2).max(32),
  password: z.string().min(6).max(128),
  name: z.string().max(64).optional(),
});

const LoginRequest = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const AuthResponse = z.object({
  id: z.string(),
  api_key: z.string(),
  name: z.string().nullable(),
  username: z.string().nullable(),
});

// ============================================================
// POST /v1/auth/register — Create a new local user
// ============================================================

const registerRoute = createRoute({
  method: 'post',
  path: '/v1/auth/register',
  tags: ['Auth'],
  summary: 'Register a new local user',
  description:
    'Create a new user with username and password. Returns user ID and an API key for authenticated requests.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: RegisterRequest,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'User created',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(AuthResponse),
        },
      },
    },
    409: {
      description: 'Username already taken',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

authLocalRoutes.openapi(registerRoute, async (c) => {
  const { username, password, name } = c.req.valid('json');

  // Per-IP rate limit for registration (5/min)
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!registerLimiter.check(`register:${ip}`)) {
    return c.json(
      createError('RATE_LIMITED', 'Too many registration attempts. Try again later.'),
      429
    );
  }

  try {
    const db = await getDB();

    // Check if username is already taken
    const existing = await findUserByUsername(db, username);
    if (existing) {
      return c.json(createError('CONFLICT', 'Username already taken'), 409);
    }

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await createLocalUser(db, { username, passwordHash, name });

    // Generate a session API key
    const rawKey = `${API_KEY_VALUE_PREFIX}${randomBytes(24).toString('base64url')}`;
    await createApiKey(db, {
      name: `session:${user.id}`,
      userId: user.id,
      keyValue: rawKey,
    });

    return c.json({
      success: true as const,
      data: { id: user.id, api_key: rawKey, name: user.name, username: user.username },
    });
  } catch (err) {
    pinoLogger.error({ err }, 'error in register');
    return errorResponse(c, 'CREATE_FAILED', 'Failed to register user');
  }
});

// ============================================================
// POST /v1/auth/login — Login with username + password
// ============================================================

const loginRoute = createRoute({
  method: 'post',
  path: '/v1/auth/login',
  tags: ['Auth'],
  summary: 'Login with username and password',
  description:
    'Authenticate with username and password. Returns user ID and a new API key for authenticated requests.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: LoginRequest,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Login successful',
      content: {
        'application/json': {
          schema: SuccessResponseSchema(AuthResponse),
        },
      },
    },
    401: {
      description: 'Invalid credentials',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

authLocalRoutes.openapi(loginRoute, async (c) => {
  const { username, password } = c.req.valid('json');

  // Per-username rate limit for login (10/min) — prevents brute force
  if (!loginLimiter.check(`login:${username}`)) {
    return c.json(createError('RATE_LIMITED', 'Too many login attempts. Try again later.'), 429);
  }

  try {
    const db = await getDB();

    // Find user by username (returns raw record with passwordHash)
    const userRecord = await findUserByUsername(db, username);
    if (!userRecord || !userRecord.passwordHash) {
      return c.json(createError('UNAUTHORIZED', 'Invalid username or password'), 401);
    }

    // Verify password
    const valid = await bcrypt.compare(password, userRecord.passwordHash);
    if (!valid) {
      return c.json(createError('UNAUTHORIZED', 'Invalid username or password'), 401);
    }

    // Generate a session API key
    const rawKey = `${API_KEY_VALUE_PREFIX}${randomBytes(24).toString('base64url')}`;
    await createApiKey(db, {
      name: `session:${userRecord.id}`,
      userId: userRecord.id,
      keyValue: rawKey,
    });

    return c.json({
      success: true as const,
      data: {
        id: userRecord.id,
        api_key: rawKey,
        name: userRecord.name ?? null,
        username: userRecord.username ?? null,
      },
    });
  } catch (err) {
    pinoLogger.error({ err }, 'error in login');
    return errorResponse(c, 'INTERNAL_ERROR', 'Login failed');
  }
});
