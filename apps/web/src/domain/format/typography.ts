// lib/typography.ts — single source of truth for text styling
// See: frontend-art-template.md §2.4
// Rule: No freehand text-* composition in components. Use typo.* constants.
//   ✅ <h1 className={typo.pageTitle}>Title</h1>
//   ✅ <p className={cn(typo.l2, 'mb-2')}>Text</p>
//   ❌ <h1 className="text-xl font-bold text-slate-900">Title</h1>

export const typo = {
  // Information hierarchy (§2.1)
  l1: 'text-foreground text-sm font-semibold',
  l2: 'text-muted-foreground text-sm font-normal',
  l3: 'text-muted-foreground text-xs font-normal',
  l4: 'text-primary text-sm font-medium',

  // Heading hierarchy (§2.2)
  pageTitle: 'text-2xl font-bold tracking-tight text-foreground',
  sectionTitle: 'text-base font-semibold text-foreground',
  subTitle: 'text-sm font-semibold text-foreground',
  label: 'text-xs font-medium text-muted-foreground uppercase tracking-wide',

  // Monospace
  mono: 'font-mono text-sm',
  monoXs: 'font-mono text-xs',
} as const;
