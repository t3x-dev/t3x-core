'use client';

import { FolderGit2, Globe, Link2, LockKeyhole, Tag, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import styles from './RepositoryIdentity.module.css';

// Identity colors are presentation only. Preserve exact tag identity (including case and #).
function identityTone(identity: string) {
  let hash = 2166136261;
  for (const character of identity)
    hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 16777619);
  return (hash >>> 0) % 6;
}

export function RepositoryMark({ id, className }: { id: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-tone={identityTone(id)}
      className={cn(styles.identity, styles.mark, className)}
    >
      <FolderGit2 size={19} strokeWidth={1.7} />
    </span>
  );
}

export function RepositoryTag({
  name,
  selected,
  onClick,
  onRemove,
  disabled,
}: {
  name: string;
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  const className = cn(styles.identity, styles.tag);
  const content = (
    <>
      <Tag aria-hidden="true" size={12} />
      <span>{name}</span>
    </>
  );
  if (onClick)
    return (
      <button
        type="button"
        className={className}
        data-tone={identityTone(name)}
        aria-pressed={selected}
        onClick={onClick}
        disabled={disabled}
      >
        {content}
      </button>
    );
  return (
    <span className={className} data-tone={identityTone(name)}>
      {content}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove tag ${name}`}
          onClick={onRemove}
          disabled={disabled}
        >
          <X aria-hidden="true" size={12} />
        </button>
      )}
    </span>
  );
}

export const visibilityOptions = [
  { value: 'private', label: 'Private', icon: LockKeyhole },
  { value: 'unlisted', label: 'Unlisted', icon: Link2 },
  { value: 'public', label: 'Public', icon: Globe },
] as const;

export function RepositoryVisibility({ value }: { value: string }) {
  const option = visibilityOptions.find((item) => item.value === value);
  if (!option) return null;
  return (
    <span className={styles.visibility}>
      <option.icon aria-hidden="true" size={12} />
      {option.label}
    </span>
  );
}
