/* eslint-disable no-console */
const PREFIX = '～';

type TraceCategory = 'sql' | 'events' | 'cache' | 'http';

interface TraceFlags {
  sql: boolean;
  events: boolean;
  cache: boolean;
  http: boolean;
}

const traces: TraceFlags = {
  sql: false,
  events: false,
  cache: false,
  http: false,
};

export function configureLogger(options: Partial<TraceFlags>): void {
  if (typeof options.sql === 'boolean') {
    traces.sql = options.sql;
  }
  if (typeof options.events === 'boolean') {
    traces.events = options.events;
  }
  if (typeof options.cache === 'boolean') {
    traces.cache = options.cache;
  }
  if (typeof options.http === 'boolean') {
    traces.http = options.http;
  }
}

export const logger = {
  info: (...messages: unknown[]) => {
    console.log(PREFIX, ...messages);
  },
  warn: (...messages: unknown[]) => {
    console.warn(PREFIX, ...messages);
  },
  error: (...messages: unknown[]) => {
    console.error(PREFIX, ...messages);
  },
  trace(category: TraceCategory, ...messages: unknown[]) {
    if (!traces[category]) {
      return;
    }
    console.log(`${PREFIX} [${category}]`, ...messages);
  },
};
