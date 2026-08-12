import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP, type LookupFunction } from 'node:net';
import { Agent } from 'undici';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export const RUNNER_ENDPOINT_ALLOWLIST_ENV = 'RUNNER_ENDPOINT_ALLOWLIST';

type LookupAddress = { address: string; family?: number };

interface ResolvedAgentEndpoint {
  url: URL;
  addresses: Array<{ address: string; family: 4 | 6 }>;
}

export interface AgentEndpointPolicyOptions {
  allowlist?: string;
  lookup?: (hostname: string) => Promise<readonly LookupAddress[]>;
}

export class UnsafeAgentEndpointError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeAgentEndpointError';
  }
}

function parseIPv4(address: string): number[] | undefined {
  const parts = address.split('.');
  if (parts.length !== 4) return undefined;

  const octets = parts.map((part) => Number(part));
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return undefined;
  }
  return octets;
}

function isBlockedIPv4(address: string): boolean {
  const octets = parseIPv4(address);
  if (!octets) return true;

  const [a, b, c] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function mappedIPv4FromIPv6(address: string): string | undefined {
  const normalized = address.toLowerCase();
  if (!normalized.startsWith('::ffff:')) return undefined;

  const mapped = normalized.slice('::ffff:'.length);
  if (parseIPv4(mapped)) return mapped;

  const halves = mapped.split(':');
  if (halves.length !== 2 || halves.some((half) => !/^[0-9a-f]{1,4}$/.test(half))) {
    return undefined;
  }
  const high = Number.parseInt(halves[0], 16);
  const low = Number.parseInt(halves[1], 16);
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

function isBlockedIPv6(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0];
  const mappedIPv4 = mappedIPv4FromIPv6(normalized);
  if (mappedIPv4) return isBlockedIPv4(mappedIPv4);

  const firstGroup = Number.parseInt(normalized.split(':')[0] || '0', 16);
  return (
    normalized === '::' ||
    normalized === '::1' ||
    (firstGroup & 0xfe00) === 0xfc00 ||
    (firstGroup & 0xffc0) === 0xfe80 ||
    (firstGroup & 0xff00) === 0xff00 ||
    normalized.startsWith('2001:db8:') ||
    normalized === '2001:db8::'
  );
}

export function isBlockedAgentAddress(address: string): boolean {
  const version = isIP(address.split('%')[0]);
  if (version === 4) return isBlockedIPv4(address);
  if (version === 6) return isBlockedIPv6(address);
  return true;
}

function parseAllowlistedOrigins(raw: string | undefined): Set<string> {
  const origins = new Set<string>();
  for (const entry of raw?.split(',') ?? []) {
    try {
      const url = new URL(entry.trim());
      if (ALLOWED_PROTOCOLS.has(url.protocol) && !url.username && !url.password) {
        origins.add(url.origin);
      }
    } catch {
      // Invalid allowlist entries grant no access.
    }
  }
  return origins;
}

async function defaultLookup(hostname: string): Promise<readonly LookupAddress[]> {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

function parseAgentEndpoint(endpoint: string): URL {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new UnsafeAgentEndpointError('Agent endpoint must be a valid URL');
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new UnsafeAgentEndpointError('Agent endpoint must use http or https');
  }
  if (url.username || url.password) {
    throw new UnsafeAgentEndpointError('Agent endpoint must not contain URL credentials');
  }
  return url;
}

function isAllowlistedOrigin(url: URL, options: AgentEndpointPolicyOptions): boolean {
  return parseAllowlistedOrigins(
    options.allowlist ?? process.env[RUNNER_ENDPOINT_ALLOWLIST_ENV]
  ).has(url.origin);
}

async function resolveSafeAgentEndpoint(
  endpoint: string,
  options: AgentEndpointPolicyOptions = {}
): Promise<ResolvedAgentEndpoint> {
  const url = parseAgentEndpoint(endpoint);

  const isAllowlisted = isAllowlistedOrigin(url, options);

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const literalFamily = isIP(hostname);
  if (literalFamily) {
    if (!isAllowlisted && isBlockedAgentAddress(hostname)) {
      throw new UnsafeAgentEndpointError(
        `Agent endpoint origin ${url.origin} is private or reserved; add it to ${RUNNER_ENDPOINT_ALLOWLIST_ENV} to authorize it explicitly`
      );
    }
    return {
      url,
      addresses: [{ address: hostname, family: literalFamily as 4 | 6 }],
    };
  }

  let addresses: readonly LookupAddress[];
  try {
    addresses = await (options.lookup ?? defaultLookup)(hostname);
  } catch {
    throw new UnsafeAgentEndpointError('Agent endpoint hostname could not be resolved safely');
  }

  if (
    addresses.length === 0 ||
    (!isAllowlisted && addresses.some(({ address }) => isBlockedAgentAddress(address)))
  ) {
    throw new UnsafeAgentEndpointError(
      `Agent endpoint origin ${url.origin} resolves to a private or reserved address; add it to ${RUNNER_ENDPOINT_ALLOWLIST_ENV} to authorize it explicitly`
    );
  }

  return {
    url,
    addresses: addresses.map(({ address, family }) => {
      const resolvedFamily = family ?? isIP(address);
      if (resolvedFamily !== 4 && resolvedFamily !== 6) {
        throw new UnsafeAgentEndpointError('Agent endpoint resolved to an invalid IP address');
      }
      return { address, family: resolvedFamily };
    }),
  };
}

export async function assertSafeAgentEndpoint(
  endpoint: string,
  options: AgentEndpointPolicyOptions = {}
): Promise<void> {
  const url = parseAgentEndpoint(endpoint);
  if (isAllowlistedOrigin(url, options)) return;
  await resolveSafeAgentEndpoint(endpoint, options);
}

function createPinnedAgent(addresses: ResolvedAgentEndpoint['addresses']): Agent {
  const lookup: LookupFunction = (_hostname, options, callback) => {
    const requestedFamily = options.family;
    const candidates = requestedFamily
      ? addresses.filter(({ family }) => family === requestedFamily)
      : addresses;

    if (candidates.length === 0) {
      const error = new Error('No validated address matches the requested address family');
      Object.assign(error, { code: 'ENOTFOUND' });
      callback(error, '', 0);
      return;
    }

    if (options.all) {
      callback(null, candidates);
      return;
    }

    const selected = candidates[0];
    callback(null, selected.address, selected.family);
  };

  return new Agent({ connect: { lookup } });
}

export async function fetchAgentEndpoint(
  endpoint: string,
  init: RequestInit = {},
  policyOptions?: AgentEndpointPolicyOptions
): Promise<Response> {
  const resolved = await resolveSafeAgentEndpoint(endpoint, policyOptions);
  const hostname = resolved.url.hostname.replace(/^\[|\]$/g, '');

  // IP literals cannot change between validation and connection.
  if (isIP(hostname)) {
    return fetch(endpoint, { ...init, redirect: 'manual' });
  }

  const dispatcher = createPinnedAgent(resolved.addresses);
  try {
    const pinnedInit: RequestInit & { dispatcher: Agent } = {
      ...init,
      redirect: 'manual',
      dispatcher,
    };
    const upstream = await fetch(endpoint, pinnedInit);

    // Buffer before closing the one-request dispatcher. Runner already parses
    // agent responses as complete JSON values, so this does not remove a
    // streaming behavior from the current execution path.
    if (!(upstream instanceof Response)) return upstream;
    const hasBody = ![101, 204, 205, 304].includes(upstream.status);
    const body = hasBody ? await upstream.arrayBuffer() : null;
    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    });
  } finally {
    await dispatcher.close();
  }
}
