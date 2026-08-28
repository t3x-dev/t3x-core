'use client';

import { Check, ChevronRight, CircleCheck, CircleX, Github, LockKeyhole } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatUserFacingError } from '@/domain/format/errors';
import { usePersonalNamespace } from '@/hooks/namespaces/usePersonalNamespace';
import { useSession } from '@/hooks/shared/useSession';
import { cn } from '@/utils/cn';

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
  return 'This namespace looks available.';
}

function ValidationRule({ children, passed }: { children: React.ReactNode; passed: boolean }) {
  return (
    <li
      className={cn(
        'flex items-center gap-2.5 text-[13px] transition-colors',
        passed ? 'text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)]'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
          passed
            ? 'border-[color-mix(in_srgb,var(--status-success)_35%,transparent)] bg-[var(--status-success-muted)] text-[var(--status-success)]'
            : 'border-[var(--stroke-strong)] text-transparent'
        )}
      >
        <Check className="size-3.5" strokeWidth={2} />
      </span>
      {children}
    </li>
  );
}

export function PersonalNamespaceOnboarding({
  suggestedNamespace,
}: {
  suggestedNamespace?: string;
}) {
  const normalizedSuggestion = useMemo(
    () => normalizeNamespace(suggestedNamespace ?? ''),
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
    const username = normalizeNamespace(getUser()?.username ?? '');
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
    <div className="flex min-h-full flex-1 overflow-y-auto bg-[var(--surface-app)]">
      <main className="mx-auto w-full max-w-[860px] px-5 py-10 sm:px-8 sm:py-14 lg:py-16">
        <h1 className="max-w-[680px] text-[38px] font-bold leading-[1.04] tracking-[-0.045em] text-[var(--text-primary)] sm:text-[48px]">
          Choose your namespace
        </h1>
        <p className="mt-4 max-w-[720px] text-[15px] leading-7 text-[var(--text-secondary)] sm:text-base">
          Your public identity and personal project home on T3X.
        </p>

        <form
          className="mt-8 rounded-[var(--radius-xl)] border border-[var(--stroke-default)] bg-[var(--surface-card)] p-5 shadow-[var(--fx-shadow-lg)] sm:mt-10 sm:p-7"
          onSubmit={handleSubmit}
        >
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
            <label className="text-sm font-bold text-[var(--text-primary)]" htmlFor="namespace">
              Personal namespace
            </label>
            {suggestion && (
              <button
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-alt)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg-strong)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50"
                onClick={() => setNamespace(suggestion)}
                type="button"
              >
                <Github className="size-3.5" />
                Use @{suggestion}
              </button>
            )}
          </div>

          <div
            className={cn(
              'flex h-[58px] overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--surface-elevated)] shadow-[var(--fx-shadow-sm)] transition-[border-color,box-shadow] focus-within:border-[var(--accent-commit)] focus-within:ring-2 focus-within:ring-[var(--accent-commit-soft)]',
              hasValue && !validation.valid
                ? 'border-[var(--status-error)]'
                : 'border-[var(--stroke-strong)]'
            )}
          >
            <span className="flex shrink-0 items-center border-r border-[var(--stroke-default)] px-3 font-mono text-xs text-[var(--text-tertiary)] sm:px-4 sm:text-sm">
              t3x.app/
            </span>
            <input
              aria-describedby="namespace-status namespace-rules"
              aria-invalid={hasValue && !validation.valid}
              autoCapitalize="none"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent px-3 font-mono text-sm font-bold text-[var(--text-primary)] outline-none sm:px-4 sm:text-base"
              id="namespace"
              maxLength={39}
              onChange={(event) => {
                setNamespace(normalizeNamespace(event.target.value));
                setSubmitError(null);
              }}
              spellCheck={false}
              value={namespace}
            />
            <span
              aria-hidden="true"
              className={cn(
                'flex w-12 shrink-0 items-center justify-center',
                validation.valid
                  ? 'text-[var(--status-success)]'
                  : hasValue
                    ? 'text-[var(--status-error)]'
                    : 'text-[var(--text-tertiary)]'
              )}
            >
              {validation.valid ? (
                <CircleCheck className="size-[19px]" />
              ) : hasValue ? (
                <CircleX className="size-[19px]" />
              ) : null}
            </span>
          </div>

          <output
            aria-live="polite"
            className={cn(
              'mt-3.5 flex min-h-5 items-center gap-2 text-[13px]',
              validation.valid
                ? 'font-semibold text-[var(--status-success)]'
                : hasValue
                  ? 'font-semibold text-[var(--status-error)]'
                  : 'text-[var(--text-tertiary)]'
            )}
            id="namespace-status"
          >
            {validation.valid ? (
              <CircleCheck className="size-4" />
            ) : hasValue ? (
              <CircleX className="size-4" />
            ) : null}
            <span>{message}</span>
          </output>

          <ul
            className="mt-5 grid list-none grid-cols-1 gap-x-10 gap-y-3 p-0 sm:grid-cols-2"
            id="namespace-rules"
          >
            <ValidationRule passed={validation.length}>2–39 characters</ValidationRule>
            <ValidationRule passed={validation.characters}>
              Letters, numbers, or hyphens
            </ValidationRule>
            <ValidationRule passed={validation.shape}>No leading or double hyphens</ValidationRule>
            <ValidationRule passed={validation.unique}>
              Unique across people and organizations
            </ValidationRule>
          </ul>

          {submitError && (
            <p className="mt-5 text-sm font-semibold text-[var(--status-error)]" role="alert">
              {submitError}
            </p>
          )}

          <div className="mt-7 flex flex-col-reverse items-stretch justify-between gap-5 border-t border-[var(--stroke-divider)] pt-6 sm:flex-row sm:items-center">
            <p className="flex items-center justify-center gap-2 text-xs text-[var(--text-tertiary)] sm:justify-start">
              <LockKeyhole className="size-4" />
              Your sign-in account stays unchanged.
            </p>
            <Button
              className="h-12 min-w-[142px] rounded-[var(--radius-lg)] px-5 text-[15px] font-bold shadow-[var(--shadow-glow)]"
              disabled={!validation.valid || saving}
              type="submit"
            >
              {saving ? 'Creating...' : 'Continue'}
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
