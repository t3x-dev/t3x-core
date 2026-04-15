import * as yaml from 'js-yaml';

const TOP_LEVEL_ORDER = ['version', 'services', 'volumes', 'networks'] as const;
const SERVICE_SLOT_ORDER = [
  'image',
  'container_name',
  'command',
  'environment',
  'ports',
  'volumes',
  'depends_on',
  'healthcheck',
  'restart',
] as const;

type Tree = Record<string, unknown>;

function orderKeys(
  obj: Record<string, unknown>,
  order: readonly string[]
): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};
  for (const key of order) {
    if (obj[key] !== undefined) ordered[key] = obj[key];
  }
  const remaining = Object.keys(obj)
    .filter((k) => !order.includes(k))
    .sort();
  for (const key of remaining) ordered[key] = obj[key];
  return ordered;
}

function normalizeService(svc: Record<string, unknown>): Record<string, unknown> {
  const ordered = orderKeys(svc, SERVICE_SLOT_ORDER);
  // Port strings containing colons (e.g. "80:80") must be explicitly quoted
  // to prevent YAML integer coercion (base-60 parsing in YAML 1.1).
  // We convert them to a custom type that forces double-quote output.
  if (Array.isArray(ordered.ports)) {
    ordered.ports = (ordered.ports as unknown[]).map((p) => String(p));
  }
  return ordered;
}

function normalizeServices(services: Record<string, unknown>): Record<string, unknown> {
  const sorted = Object.keys(services).sort();
  const out: Record<string, unknown> = {};
  for (const name of sorted) {
    const svc = services[name];
    out[name] =
      svc && typeof svc === 'object' && !Array.isArray(svc)
        ? normalizeService(svc as Record<string, unknown>)
        : svc;
  }
  return out;
}

/**
 * Emits a canonical docker-compose YAML string from a plain tree object.
 *
 * Properties:
 * - Deterministic: same input always produces identical bytes.
 * - Top-level keys are ordered: version, services, volumes, networks.
 * - Service names are sorted alphabetically.
 * - Service slots follow canonical order (image, container_name, command, …).
 * - Port strings are double-quoted to prevent YAML integer coercion.
 * - undefined slots are omitted.
 */
export function emitDockerCompose(tree: Tree): string {
  const ordered = orderKeys(tree, TOP_LEVEL_ORDER);
  if (ordered.services && typeof ordered.services === 'object') {
    ordered.services = normalizeServices(ordered.services as Record<string, unknown>);
  }
  return yaml.dump(ordered, {
    indent: 2,
    lineWidth: -1,
    quotingType: '"',
    noRefs: true,
  });
}
