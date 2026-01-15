/**
 * CORS middleware configuration
 */
import { cors } from 'hono/cors';

export const corsMiddleware = cors({
  origin: (origin) => {
    // Allow localhost origins for development
    if (!origin) return '*';
    if (origin.startsWith('http://localhost:')) return origin;
    if (origin.startsWith('http://127.0.0.1:')) return origin;
    // Allow configured origins
    const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || [];
    if (allowedOrigins.includes(origin)) return origin;
    return null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
  credentials: true,
});
