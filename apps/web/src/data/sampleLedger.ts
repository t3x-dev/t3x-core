import type { SemanticEntry } from '../types/semantic';

export const semanticFeed: SemanticEntry[] = [
  {
    id: 'CF-284',
    title: 'Osaka Spring Getaway',
    summary:
      'Polished three-day plan that balances food alleys, neon nightlife, and quiet shrines. Awaiting merge into main itinerary.',
    author: 'Aya',
    stage: 'commit',
    status: 'validated',
    bridgePrompt: '/plan → /polish',
    updatedAt: '2 hours ago',
    tags: ['travel', 'merge-ready', 'facets:7'],
    evidenceCount: 6,
    facets: ['destination: Osaka', 'budget: ≤ 2k USD', 'focus: food-heavy'],
  },
  {
    id: 'CF-291',
    title: 'Budget relaxation constraint',
    summary:
      'Detected conflict between “≤2k USD” limit and new “add Kyoto day-trip“ request. Holding for explicit guidance.',
    author: 'Ledger Bot',
    stage: 'draft',
    status: 'needs-review',
    bridgePrompt: '/inspect /facet-audit',
    updatedAt: '38 minutes ago',
    tags: ['constraint', 'conflict'],
    evidenceCount: 3,
    facets: ['budget: conflict', 'time_range: weekend'],
    parent: 'CF-284',
  },
  {
    id: 'CF-297',
    title: 'Street food preference thread',
    summary:
      'User emphasized “lively & food-heavy” again with concrete stall examples. Suggest promoting to must-have.',
    author: 'Kai',
    stage: 'turn',
    status: 'drafting',
    bridgePrompt: '/note',
    updatedAt: '14 minutes ago',
    tags: ['turn', 'preference'],
    evidenceCount: 2,
    facets: ['preference: food-heavy', 'vibe: lively'],
  },
  {
    id: 'CF-300',
    title: 'Side quest: Kansai rail pass lookup',
    summary:
      'Tool call draft collecting evidence about Kansai Thru Pass validity. Waiting on validator before linking to plan.',
    author: 'Tooling',
    stage: 'draft',
    status: 'drafting',
    bridgePrompt: '/tool kansai_pass',
    updatedAt: '5 minutes ago',
    tags: ['tool', 'evidence'],
    evidenceCount: 4,
    facets: ['transport: Kansai pass'],
  },
];

export const timeline = [
  {
    id: 'CF-300',
    label: 'Tool draft imported',
    detail: 'Kansai rail pass lookup added 4 evidence snippets.',
    time: '5m ago',
    stage: 'draft',
  },
  {
    id: 'CF-291',
    label: 'Facet conflict detected',
    detail: 'Budget vs Kyoto day-trip flagged by validator.',
    time: '38m ago',
    stage: 'draft',
  },
  {
    id: 'CF-284',
    label: 'Commit signed',
    detail: 'Osaka plan promoted to semantic commit.',
    time: '2h ago',
    stage: 'commit',
  },
];

export const boardColumns: Record<
  string,
  Array<Pick<SemanticEntry, 'id' | 'title' | 'summary' | 'stage' | 'status'>>
> = {
  'Next Drafts': [
    {
      id: 'CF-297',
      title: 'Street food preference',
      summary: 'Need structured facet extraction before merge.',
      stage: 'turn',
      status: 'drafting',
    },
    {
      id: 'CF-300',
      title: 'Kansai pass evidence',
      summary: 'Tool draft needs validator run.',
      stage: 'draft',
      status: 'drafting',
    },
  ],
  'Needs Validation': [
    {
      id: 'CF-291',
      title: 'Budget conflict',
      summary: 'Blocking merge until user clarifies trade-off.',
      stage: 'draft',
      status: 'needs-review',
    },
  ],
  'Stable Commits': [
    {
      id: 'CF-284',
      title: 'Osaka plan v3',
      summary: 'Ready to sync with narrative timeline.',
      stage: 'commit',
      status: 'validated',
    },
  ],
};
