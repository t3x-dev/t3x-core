import { isAlias, isScalar, parseAllDocuments, visit } from 'yaml';

export const YOPS_YAML_PROFILE_UNSUPPORTED = 'YOPS_YAML_PROFILE_UNSUPPORTED' as const;

export type YamlProfileErrorKind = 'syntax' | 'unsupported-profile';

export interface YamlProfileParseOk {
  ok: true;
  value: unknown;
}

export interface YamlProfileParseError {
  ok: false;
  kind: YamlProfileErrorKind;
  error: string;
}

export type YamlProfileParseResult = YamlProfileParseOk | YamlProfileParseError;

function unsupported(feature: string): YamlProfileParseError {
  return {
    ok: false,
    kind: 'unsupported-profile',
    error: `Unsupported YAML profile feature: ${feature}`,
  };
}

export function parseYamlDeclaration(yamlStr: string): YamlProfileParseResult {
  const docs = parseAllDocuments(yamlStr, {
    version: '1.2',
    prettyErrors: false,
  });

  if (docs.length > 1) {
    return unsupported('multiple documents');
  }

  const doc = docs[0];
  if (!doc) {
    return { ok: true, value: undefined };
  }

  if (doc.errors.length > 0) {
    return {
      ok: false,
      kind: 'syntax',
      error: doc.errors.map((err) => err.message).join('; '),
    };
  }

  let violation: YamlProfileParseError | null = null;
  visit(doc, {
    Node(_key, node) {
      if (isAlias(node)) {
        violation = unsupported('aliases');
        return visit.BREAK;
      }

      if (node?.anchor) {
        violation = unsupported('anchors');
        return visit.BREAK;
      }
    },
    Pair(_key, pair) {
      if (isScalar(pair.key) && pair.key.type === 'PLAIN' && pair.key.value === '<<') {
        violation = unsupported('merge keys');
        return visit.BREAK;
      }
    },
  });

  if (violation) {
    return violation;
  }

  return { ok: true, value: doc.toJSON() };
}
