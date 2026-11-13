'use client';

import { CircleCheck, CircleX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatUserFacingError } from '@/domain/format/errors';
import { usePersonalNamespace } from '@/hooks/namespaces/usePersonalNamespace';
import { useSession } from '@/hooks/shared/useSession';
import { cn } from '@/utils/cn';
import { AccountEntry } from './AccountEntry';

const RESERVED_NAMESPACES = new Set([
  'api',
  'chat',
  'deploy',
  'login',
  'new',
  'onboarding',
  'project',
  'settings',
  'share',
  't3x-dev',
  'templates',
]);

export interface NamespaceValidation {
  characters: boolean;
  length: boolean;
  shape: boolean;
  unique: boolean;
  valid: boolean;
}

export function normalizeNamespace(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}

export function validateNamespace(value: string): NamespaceValidation {
  const namespace = normalizeNamespace(value);
  const length = namespace.length >= 2 && namespace.length <= 39;
  const characters = namespace.length > 0 && /^[a-z0-9-]+$/.test(namespace);
  const shape =
    namespace.length > 0 &&
    !namespace.startsWith('-') &&
    !namespace.endsWith('-') &&
    !namespace.includes('--');
  const unique = length && characters && shape && !RESERVED_NAMESPACES.has(namespace);

  return {
    characters,
    length,
    shape,
    unique,
    valid: unique,
  };
}

function getValidationMessage(namespace: string, validation: NamespaceValidation): string {
  if (!namespace) return 'Choose a short name people can recognize.';
  if (!validation.length) return 'Use between 2 and 39 characters.';
  if (!validation.characters) return 'Use lowercase letters, numbers, or hyphens only.';
  if (!validation.shape) return 'A namespace cannot begin, end, or repeat a hyphen.';
  if (RESERVED_NAMESPACES.has(namespace)) return `“${namespace}” is reserved by T3X.`;
  return 'This namespace format is valid.';
}

function namespaceSuggestion(value: string): string {
  const slug = normalizeNamespace(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return validateNamespace(slug).valid ? slug : '';
}

export function PersonalNamespaceOnboarding({
  suggestedNamespace,
}: {
  suggestedNamespace?: string;
}) {
  const normalizedSuggestion = useMemo(
    () => namespaceSuggestion(suggestedNamespace ?? ''),
    [suggestedNamespace]
  );
  const [suggestion, setSuggestion] = useState(normalizedSuggestion);
  const [namespace, setNamespace] = useState(normalizedSuggestion);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const router = useRouter();
  const { create: createPersonalNamespace } = usePersonalNamespace();
  const { getUser } = useSession();
  const validation = validateNamespace(namespace);
  const message = getValidationMessage(namespace, validation);
  const hasValue = namespace.length > 0;

  useEffect(() => {
    if (normalizedSuggestion) return;
    const username = namespaceSuggestion(getUser()?.username ?? '');
    if (!username) return;
    setSuggestion(username);
    setNamespace(username);
  }, [getUser, normalizedSuggestion]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validation.valid || saving) return;
    setSaving(true);
    setSubmitError(null);
    try {
      const created = await createPersonalNamespace(namespace);
      router.push(`/${created.slug}`);
    } catch (error) {
      setSubmitError(formatUserFacingError(error, 'Failed to create namespace.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AccountEntry
      kind="namespace"
      title="Choose your namespace"
      description="This is the first part of your repository URLs."
    >
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-sm font-medium" htmlFor="namespace">
            Personal namespace
          </label>
          {suggestion && (
            <Button
              className="h-auto min-h-9 max-w-full whitespace-normal break-all text-xs"
              disabled={saving}
              onClick={() => {
                setNamespace(suggestion);
                setSubmitError(null);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Use @{suggestion}
            </Button>
          )}
        </div>

        <div
          className={cn(
            'flex h-9 overflow-hidden pointer-coarse:h-11 rounded-md border focus-within:ring-2 focus-within:ring-[var(--ring)]',
            hasValue && !validation.valid
              ? 'border-[var(--status-error)]'
              : 'border-[var(--stroke-strong)]'
          )}
        >
          <span
            aria-hidden="true"
            className="flex shrink-0 items-center border-r border-[var(--stroke-divider)] bg-[var(--management-control-bg)] px-3 font-mono text-sm text-[var(--text-secondary)]"
          >
            /
          </span>
          <input
            aria-describedby="namespace-status"
            aria-invalid={hasValue && !validation.valid}
            autoCapitalize="none"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent px-3 font-mono text-base outline-none sm:text-sm"
            disabled={saving}
            id="namespace"
            maxLength={39}
            onChange={(event) => {
              setNamespace(normalizeNamespace(event.target.value));
              setSubmitError(null);
            }}
            spellCheck={false}
            value={namespace}
          />
          {hasValue && (
            <span
              aria-hidden="true"
              className={cn(
                'flex w-10 shrink-0 items-center justify-center',
                validation.valid ? 'text-[var(--status-success)]' : 'text-[var(--status-error)]'
              )}
            >
              {validation.valid ? (
                <CircleCheck className="size-4" />
              ) : (
                <CircleX className="size-4" />
              )}
            </span>
          )}
        </div>

        <output
          aria-live="polite"
          className={cn(
            'block text-xs leading-5',
            hasValue && !validation.valid
              ? 'text-[var(--status-error)]'
              : 'text-[var(--text-secondary)]'
          )}
          id="namespace-status"
        >
          {message}
        </output>

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-md bg-[var(--management-control-bg)] px-2.5 py-2 text-xs text-[var(--text-secondary)]">
          <span>Repository path</span>
          <code className="min-w-0 [overflow-wrap:anywhere] text-[var(--text-primary)]">
            /{validation.valid ? namespace : 'namespace'}/my-repo
          </code>
        </div>

        {submitError && (
          <p
            className="rounded-md bg-[var(--status-error-muted)] px-3 py-2 text-sm text-[var(--status-error)]"
            role="alert"
          >
            {submitError}
          </p>
        )}

        <Button
          className="h-9 w-full pointer-coarse:h-11"
          disabled={!validation.valid || saving}
          type="submit"
        >
          {saving ? 'Creating…' : 'Continue'}
        </Button>
        <p className="text-xs leading-5 text-[var(--text-secondary)]">
          T3X checks availability when you continue. Your sign-in account stays unchanged.
        </p>
      </form>
    </AccountEntry>
  );
}
