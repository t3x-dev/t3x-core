import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { diffApiSurfaceFromBase } from '../api-diff/diff.mjs';

const VALID_STATUSES = new Set(['frozen', 'evolving', 'experimental']);
function toRootPath(rootDir) {
  if (rootDir instanceof URL) {
    return fileURLToPath(rootDir);
  }
  return rootDir;
}

function readYamlSpec(rootPath) {
  return yaml.load(readFileSync(join(rootPath, 'packages/yops/yops.yaml'), 'utf8'));
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateStatus({ value, context, errors }) {
  if (!isNonEmptyString(value)) {
    errors.push(`${context}: missing required status`);
  } else if (!VALID_STATUSES.has(value)) {
    errors.push(`${context}: status must be one of frozen, evolving, experimental`);
  }
}

function validateSpecMetadata(spec) {
  const errors = [];
  const operations = spec?.operations;
  if (!operations || typeof operations !== 'object' || Array.isArray(operations)) {
    return { errors: ['packages/yops/yops.yaml must define operations'], operationCount: 0 };
  }

  for (const [opName, opDef] of Object.entries(operations)) {
    validateStatus({ value: opDef?.status, context: opName, errors });
    const fields = opDef?.fields;
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
      errors.push(`${opName}: missing fields`);
      continue;
    }

    for (const [fieldName, fieldDef] of Object.entries(fields)) {
      const context = `${opName}.${fieldName}`;
      validateStatus({ value: fieldDef?.status, context, errors });

      if (fieldDef?.deprecated_in !== undefined && !isNonEmptyString(fieldDef.deprecated_in)) {
        errors.push(`${context}.deprecated_in must be a non-empty string`);
      }
      if (
        fieldDef?.replacement_field !== undefined &&
        !isNonEmptyString(fieldDef.replacement_field)
      ) {
        errors.push(`${context}.replacement_field must be a non-empty string`);
      }
      if (fieldDef?.replacement_field !== undefined && fieldDef?.deprecated_in === undefined) {
        errors.push(`${context}.replacement_field requires deprecated_in`);
      }
    }
  }

  return { errors, operationCount: Object.keys(operations).length };
}

function validateReadmePolicy(rootPath) {
  const readme = readFileSync(join(rootPath, 'packages/yops/README.md'), 'utf8');
  const errors = [];

  for (const requiredText of [
    '## Stability policy',
    '`frozen`',
    '`evolving`',
    '`experimental`',
    '`deprecated_in`',
    '`replacement_field`',
    'DEPRECATED_FIELD',
  ]) {
    if (!readme.includes(requiredText)) {
      errors.push(`packages/yops/README.md must document ${requiredText}`);
    }
  }

  return errors;
}

function readDeclarationText({ rootPath, prBody }) {
  const chunks = [];
  if (isNonEmptyString(prBody)) {
    chunks.push(prBody);
  }

  const changesetDir = join(rootPath, '.changeset');
  if (existsSync(changesetDir)) {
    for (const name of readdirSync(changesetDir)) {
      if (name.endsWith('.md') && name !== 'README.md') {
        chunks.push(readFileSync(join(changesetDir, name), 'utf8'));
      }
    }
  }

  return chunks.join('\n\n');
}

function hasBreakingDeclaration({ rootPath, prBody }) {
  const text = readDeclarationText({ rootPath, prBody });
  return /breaking declaration/i.test(text) && /(@t3x-dev\/yops|yops)/i.test(text);
}

function breakingYopsApiResults(results) {
  return results.filter(
    (result) => result.packageName === '@t3x-dev/yops' && result.hasBreakingChanges
  );
}

export function validateYopsStability({
  rootDir = new URL('../..', import.meta.url),
  apiDiffResults = null,
  baseRef = process.env.YOPS_STABILITY_BASE_REF || null,
  prBody = process.env.T3X_PR_BODY || '',
} = {}) {
  const rootPath = toRootPath(rootDir);
  const errors = [];
  const warnings = [];
  const specResult = validateSpecMetadata(readYamlSpec(rootPath));
  errors.push(...specResult.errors);
  errors.push(...validateReadmePolicy(rootPath));

  const diffResults =
    apiDiffResults ??
    (baseRef
      ? diffApiSurfaceFromBase({
          rootDir,
          baseRef,
        })
      : null);

  if (diffResults) {
    const breakingResults = breakingYopsApiResults(diffResults);
    if (breakingResults.length > 0 && !hasBreakingDeclaration({ rootPath, prBody })) {
      errors.push(
        'Breaking @t3x-dev/yops API changes require a declaration in the PR body or .changeset/*.md.'
      );
    }
  } else {
    warnings.push('API diff declaration check skipped because no base ref was provided.');
  }

  return {
    errors,
    warnings,
    operationCount: specResult.operationCount,
  };
}
