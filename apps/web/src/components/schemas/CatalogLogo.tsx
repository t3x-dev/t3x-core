'use client';
import type { SchemaCatalogItem } from '@t3x-dev/api-client';
import {
  Cpu,
  Database,
  FileText,
  FlaskConical,
  Layers3,
  Network,
  Shield,
  Sparkles,
  Workflow,
  Zap,
} from 'lucide-react';
import Image from 'next/image';
import { resourceUrl } from '@/components/project/StateAuthorReadme';
import { useSchemaIntroduction } from '@/hooks/schemas/useSchemaCatalog';
import { cn } from '@/utils/cn';

const logoTones = [
  'bg-[var(--status-info)]',
  'bg-[var(--accent-branch)]',
  'bg-[var(--status-success)]',
  'bg-[var(--accent-pending)]',
  'bg-[var(--accent-conversation)]',
];
const starterLogos = new Set(['t3x/product-brief', 't3x/care-checklist', 't3x/compose-services']);

const sizes = {
  card: { px: 40, box: 'size-10 rounded-xl', icon: 'size-5' },
  large: { px: 48, box: 'size-12 rounded-lg', icon: 'size-6' },
  hero: { px: 72, box: 'size-[72px] rounded-[18px]', icon: 'size-8' },
} as const;

export function CatalogLogo({
  item,
  size = 'card',
}: {
  item: SchemaCatalogItem;
  size?: keyof typeof sizes;
}) {
  const intro = useSchemaIntroduction(item.presentationRef);
  const avatar = intro.data?.document.resources.find(
    (resource) => resource.path === intro.data?.document.avatarPath
  );
  const name = item.identity.canonicalName;
  const dim = sizes[size];
  if (avatar) {
    return (
      <Image
        src={resourceUrl(avatar)}
        alt=""
        width={dim.px}
        height={dim.px}
        unoptimized
        className={cn('shrink-0 object-cover shadow-sm', dim.box)}
      />
    );
  }
  // Only unowned built-ins receive T3X artwork. Similar community names do not
  // inherit an official identity. Other glyphs are decorative, not capabilities.
  if (
    !item.identity.ownerProjectId &&
    item.identity.visibility === 'official' &&
    starterLogos.has(name)
  ) {
    return (
      <Image
        src={`/schema-logos/${name.split('/')[1]}.png`}
        unoptimized
        alt=""
        width={dim.px}
        height={dim.px}
        className={cn('shrink-0 shadow-sm', dim.box)}
      />
    );
  }
  const hash = Array.from(name).reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0);
  const Icon = /power|energy/.test(name)
    ? Zap
    : /network|api/.test(name)
      ? Network
      : /sensor|hardware|actuator|device/.test(name)
        ? Cpu
        : /evaluat|experiment|research/.test(name)
          ? FlaskConical
          : /security|safety|policy|guardrail/.test(name)
            ? Shield
            : /database|data/.test(name)
              ? Database
              : /agent|prompt|context/.test(name)
                ? Sparkles
                : /workflow|automation|rollout|delivery/.test(name)
                  ? Workflow
                  : /prd|requirement|plan|brief/.test(name)
                    ? FileText
                    : Layers3;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center text-[var(--on-status)] shadow-sm',
        dim.box,
        logoTones[hash % logoTones.length]
      )}
    >
      <Icon className={dim.icon} strokeWidth={1.8} />
    </span>
  );
}
