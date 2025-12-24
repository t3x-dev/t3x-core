/**
 * Request logging middleware
 */
import { logger } from 'hono/logger';

export const loggerMiddleware = logger((message: string, ...rest: string[]) => {
  console.log(message, ...rest);
});
