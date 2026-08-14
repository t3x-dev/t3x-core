import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP, type LookupFunction } from 'node:net';
import { Agent } from 'undici';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

// IANA IPv4 Special-Purpose Address Registry, plus multicast space.
// https://www.iana.org/assignments/iana-ipv4-special-registry/
const BLOCKED_IPV4_CIDRS: ReadonlyArray<readonly [network: string, prefixLength: number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.31.196.0', 24],
  ['192.52.193.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['192.175.48.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

// IANA IPv6 Special-Purpose Address Registry, plus multicast space.
// Broader registry parents intentionally cover their registered child ranges.
// https://www.iana.org/assignments/iana-ipv6-special-registry/
const BLOCKED_IPV6_CIDRS: ReadonlyArray<readonly [network: string, prefixLength: number]> = [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['100:0:0:1::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['2620:4f:8000::', 48],
  ['3fff::', 20],
  ['5f00::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
];

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

function ipv4ToNumber(address: string): number | undefined {
  const octets = parseIPv4(address);
  if (!octets) return undefined;
  return octets.reduce((value, octet) => value * 256 + octet, 0) >>> 0;
}

function isInIPv4Cidr(address: string, network: string, prefixLength: number): boolean {
  const value = ipv4ToNumber(address);
  const networkValue = ipv4ToNumber(network);
  if (value === undefined || networkValue === undefined) return false;

  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (value & mask) >>> 0 === (networkValue & mask) >>> 0;
}

function isBlockedIPv4(address: string): boolean {
  if (!parseIPv4(address)) return true;
  return BLOCKED_IPV4_CIDRS.some(([network, prefixLength]) =>
    isInIPv4Cidr(address, network, prefixLength)
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

function parseIPv6Groups(address: string): number[] | undefined {
  const normalized = address.toLowerCase().split('%')[0];
  if (isIP(normalized) !== 6) return undefined;

  const compressionParts = normalized.split('::');
  if (compressionParts.length > 2) return undefined;

  const parseSide = (side: string): number[] | undefined => {
    if (!side) return [];
    const groups: number[] = [];
    for (const part of side.split(':')) {
      if (part.includes('.')) {
        const octets = parseIPv4(part);
        if (!octets) return undefined;
        groups.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(part)) return undefined;
      groups.push(Number.parseInt(part, 16));
    }
    return groups;
  };

  const head = parseSide(compressionParts[0]);
  const tail = parseSide(compressionParts[1] ?? '');
  if (!head || !tail) return undefined;

  if (compressionParts.length === 1) return head.length === 8 ? head : undefined;
  const omittedGroups = 8 - head.length - tail.length;
  if (omittedGroups < 1) return undefined;
  return [...head, ...Array.from({ length: omittedGroups }, () => 0), ...tail];
}

function ipv6ToBigInt(address: string): bigint | undefined {
  const groups = parseIPv6Groups(address);
  if (!groups) return undefined;
  return groups.reduce((value, group) => (value << 16n) | BigInt(group), 0n);
}

function isInIPv6Cidr(address: string, network: string, prefixLength: number): boolean {
  const value = ipv6ToBigInt(address);
  const networkValue = ipv6ToBigInt(network);
  if (value === undefined || networkValue === undefined) return false;

  const shift = BigInt(128 - prefixLength);
  return value >> shift === networkValue >> shift;
}

function isBlockedIPv6(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0];
  const mappedIPv4 = mappedIPv4FromIPv6(normalized);
  if (mappedIPv4) return true;
  if (!parseIPv6Groups(normalized)) return true;

  // Fail closed for unallocated and non-global IPv6 space. Public Runner
  // endpoints should resolve to global unicast (2000::/3) unless their exact
  // origin is explicitly allowlisted.
  if (!isInIPv6Cidr(normalized, '2000::', 3)) return true;

  return BLOCKED_IPV6_CIDRS.some(([network, prefixLength]) =>
    isInIPv6Cidr(normalized, network, prefixLength)
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
