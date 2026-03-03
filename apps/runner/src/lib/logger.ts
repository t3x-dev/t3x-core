/**
 * Centralized Pino Logger
 *
 * Single source of truth for Runner logging configuration.
 * - Dev: pino-pretty with colorize
 * - Prod: raw JSON (machine-readable, Railway auto-collects)
 *
 * Env: LOG_LEVEL (default: 'info')
 */

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  }),
});
