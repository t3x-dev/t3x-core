'use client';

import {
  type RepositoryIcon,
  RepositoryIconColorSchema,
  type RepositoryIconSelection,
  RepositoryIconSelectionSchema,
} from '@t3x-dev/api-client';
import {
  BookOpen,
  Bot,
  Boxes,
  Braces,
  ChartNoAxesCombined,
  Cloud,
  Cpu,
  Database,
  FileCodeCorner,
  FlaskConical,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  Globe,
  Layers,
  Link2,
  ListChecks,
  LockKeyhole,
  type LucideIcon,
  Network,
  Package,
  ShieldCheck,
  Tag,
  Terminal,
  Workflow,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import styles from './RepositoryIdentity.module.css';

export const repositoryGlyphs = {
  flask: FlaskConical,
  repository: FolderGit2,
  database: Database,
  workflow: Workflow,
  boxes: Boxes,
  braces: Braces,
  code: FileCodeCorner,
  book: BookOpen,
  shield: ShieldCheck,
  branch: GitBranch,
  'pull-request': GitPullRequest,
  layers: Layers,
  network: Network,
  package: Package,
  terminal: Terminal,
  chip: Cpu,
  chart: ChartNoAxesCombined,
  bot: Bot,
  cloud: Cloud,
  globe: Globe,
  lock: LockKeyhole,
  bolt: Zap,
  tools: Wrench,
  checklist: ListChecks,
} satisfies Record<RepositoryIconSelection['key'], LucideIcon>;

// Identity colors are presentation only. Preserve exact tag identity (including case and #).
function identityTone(identity: string) {
  const tones = RepositoryIconColorSchema.options;
  let hash = 2166136261;
  for (const character of identity)
    hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 16777619);
  return tones[(hash >>> 0) % tones.length];
}

export function RepositoryMark({
  id,
  icon,
  className,
}: {
  id: string;
  icon?: RepositoryIcon | null;
  className?: string;
}) {
  const selection = icon ? RepositoryIconSelectionSchema.safeParse(icon).data : undefined;
  const Icon = selection ? repositoryGlyphs[selection.key] : FolderGit2;
  return (
    <span
      aria-hidden="true"
      data-tone={selection?.color ?? identityTone(id)}
      className={cn(styles.identity, styles.mark, className)}
    >
      <Icon size={19} strokeWidth={1.7} />
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
