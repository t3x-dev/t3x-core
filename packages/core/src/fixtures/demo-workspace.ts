import type { Author, Provenance } from '../commit';
import type { SemanticContent, SlotValue, TreeNode } from '../semantic/types';
import type { YOp } from '../t3x-yops/types';
import type { Assertion, Constraint } from '../types';

export type DemoSlotValue = SlotValue;
export type DemoTreeNode = TreeNode;

export interface DemoFlatNode {
  id: string;
  text: string;
}

export interface DemoWorkspaceFixture {
  id: string;
  project: {
    name: string;
    metadata: {
      is_demo: true;
      demo_fixture_id: string;
      demo_fixture_version: number;
      demo_kind: 'professional_workspace';
    };
  };
  source: {
    title: string;
    text: string;
  };
  replay: {
    label: string;
    yops: YOp[];
    trees: TreeNode[];
    relations: SemanticContent['relations'];
    draft_nodes: DemoFlatNode[];
  };
  commit: {
    message: string;
    author: Author;
    provenance: Provenance;
  };
  leaf: {
    type: 'article';
    title: string;
    constraints: Constraint[];
    config: {
      prompt_template: string;
      model: 'fixture-replay';
      max_tokens: number;
    };
    output: string;
    assertions: Assertion[];
  };
}

export interface LandingDemoCase {
  id: 'prompt_review' | 'meeting_notes' | 'prompt_diff';
  title: string;
  description: string;
  source: {
    title: string;
    text: string;
  };
  yops: YOp[];
  commit: {
    message: string;
    branch: 'main';
  };
}

function demoTrees(trees: TreeNode[]): TreeNode[] {
  return trees;
}

export const PROMPT_DIFF_DEMO = {
  name: 'Prompt version comparison',
  base: demoTrees([
    {
      key: 'assistant_prompt',
      slots: {
        role: 'customer support agent',
        tone: 'concise',
        escalation_rule: 'send refunds to manual review',
      },
      children: [
        {
          key: 'constraints',
          slots: {
            must: ['cite policy before giving a refund answer', 'ask for order id'],
            avoid: 'inventing policy details',
          },
          children: [],
        },
      ],
    },
  ]),
  target: demoTrees([
    {
      key: 'assistant_prompt',
      slots: {
        role: 'customer support agent',
        tone: 'calm and precise',
        escalation_rule: 'send refunds over $100 to manual review',
      },
      children: [
        {
          key: 'constraints',
          slots: {
            must: ['cite policy before giving a refund answer', 'ask for order id'],
            avoid: 'inventing policy details',
          },
          children: [],
        },
        {
          key: 'examples',
          slots: {
            good_reply: 'I can help, but first I need the order id and policy reference.',
          },
          children: [],
        },
      ],
    },
  ]),
};

export const MEETING_NOTES_EXTRACTION_DEMO = {
  name: 'Meeting notes extraction',
  sourceText:
    'Decision: ship the WebUI polish pass before the open-source announcement. Risk: dark mode parity and complex merge screenshots need regression coverage. Owner: frontend. Deadline: Friday.',
  expectedTrees: demoTrees([
    {
      key: 'release_readiness',
      slots: {
        decision: 'ship the WebUI polish pass before the open-source announcement',
        owner: 'frontend',
        deadline: 'Friday',
      },
      children: [
        {
          key: 'risks',
          slots: {
            items: ['dark mode parity', 'complex merge screenshots'],
            mitigation: 'regression coverage',
          },
          children: [],
        },
      ],
    },
  ]),
};

export const MERGE_SEMANTIC_CHANGES_DEMO = {
  name: 'Merge semantic changes',
  base: demoTrees([
    {
      key: 'trip_plan',
      slots: {
        destination: 'Sydney',
        duration: 'three-day trip',
        focus: ['beaches', 'coastal walks', 'public transport'],
      },
      children: [
        {
          key: 'activities',
          slots: {
            pace: 'moderate',
            transport_style: 'public transit',
          },
          children: [
            {
              key: 'coastal_walk',
              slots: {
                name: 'Bondi to Coogee coastal walk',
                priority: 'must do',
                note: 'coastal scenery',
              },
              children: [],
            },
          ],
        },
        {
          key: 'transport',
          slots: {
            payment_methods: ['Opal', 'contactless payment'],
            modes: ['ferries', 'trains', 'buses'],
          },
          children: [],
        },
      ],
    },
  ]),
  source: demoTrees([
    {
      key: 'trip_plan',
      slots: {
        destination: 'Sydney and Hawaii',
        duration: 'three-day trip',
        focus: ['beaches', 'coastal walks', 'public transport'],
      },
      children: [
        {
          key: 'activities',
          slots: {
            pace: 'moderate',
            transport_style: 'public transit',
          },
          children: [
            {
              key: 'coastal_walk',
              slots: {
                name: 'Bondi to Coogee coastal walk',
                priority: 'must do',
                note: 'start at Bondi and stop for coffee in Coogee',
              },
              children: [],
            },
            {
              key: 'food_ideas',
              slots: {
                fresh: ['sushi', 'Mediterranean bowl', 'tacos with fresh toppings'],
                comforting: ['pizza', 'ramen'],
              },
              children: [],
            },
          ],
        },
        {
          key: 'transport',
          slots: {
            payment_methods: ['Opal', 'contactless payment'],
            modes: ['ferries', 'trains', 'buses'],
          },
          children: [],
        },
      ],
    },
  ]),
  target: demoTrees([
    {
      key: 'trip_plan',
      slots: {
        destination: 'Sydney and Tasmania',
        duration: 'three-day trip',
        focus: ['beaches', 'coastal walks', 'public transport'],
      },
      children: [
        {
          key: 'activities',
          slots: {
            pace: 'moderate',
            transport_style: 'public transit',
          },
          children: [
            {
              key: 'coastal_walk',
              slots: {
                name: 'Bondi to Coogee coastal walk',
                priority: 'optional morning',
                note: 'keep the walk if weather is clear',
              },
              children: [],
            },
            {
              key: 'weather_backup',
              slots: {
                plan: 'museum and cafe route',
                trigger: 'heavy rain',
              },
              children: [],
            },
          ],
        },
        {
          key: 'transport',
          slots: {
            payment_methods: ['Opal', 'contactless payment'],
            modes: ['ferries', 'trains', 'buses'],
          },
          children: [],
        },
      ],
    },
  ]),
  expected: {
    conflicts: ['trip_plan', 'trip_plan/activities/coastal_walk'],
    sourceOnly: ['trip_plan/activities/food_ideas'],
    targetOnly: ['trip_plan/activities/weather_backup'],
    autoKept: ['trip_plan/activities', 'trip_plan/transport'],
  },
};

const PROMPT_REVIEW_TREES: TreeNode[] = demoTrees([
  {
    key: 'support_escalation_review',
    slots: {
      objective: 'tighten refund escalation behavior for a customer support assistant',
      audience: 'customer support team',
      rollout: 'pilot on Friday',
    },
    children: [
      {
        key: 'refund_policy',
        slots: {
          threshold: 'Refunds above $100 require manual review',
          required_evidence: ['order id', 'policy citation', 'refund amount'],
          forbidden_behavior: 'do not invent policy details',
        },
        children: [],
      },
      {
        key: 'tone_and_safety',
        slots: {
          tone: 'calm, precise, and policy-grounded',
          must_do: ['acknowledge the customer issue', 'ask for missing evidence before deciding'],
          avoid: ['guaranteeing outcomes', 'blaming the customer'],
        },
        children: [],
      },
      {
        key: 'open_risks',
        slots: {
          items: [
            'agents may skip the policy citation under time pressure',
            'refund threshold copy can drift across prompt versions',
          ],
          mitigation:
            'commit the reviewed prompt meaning and validate leaf outputs against constraints',
        },
        children: [],
      },
    ],
  },
]);

const PROMPT_REVIEW_RELATIONS: SemanticContent['relations'] = [
  {
    from: 'support_escalation_review/refund_policy',
    to: 'support_escalation_review/open_risks',
    type: 'conditions',
  },
];

const PROMPT_REVIEW_YOPS: YOp[] = [
  { define: { path: 'support_escalation_review' } },
  {
    populate: {
      path: 'support_escalation_review',
      values: {
        objective: 'tighten refund escalation behavior for a customer support assistant',
        audience: 'customer support team',
        rollout: 'pilot on Friday',
      },
    },
  },
  { define: { path: 'support_escalation_review/refund_policy' } },
  {
    populate: {
      path: 'support_escalation_review/refund_policy',
      values: {
        threshold: 'Refunds above $100 require manual review',
        required_evidence: ['order id', 'policy citation', 'refund amount'],
        forbidden_behavior: 'do not invent policy details',
      },
    },
  },
  { define: { path: 'support_escalation_review/tone_and_safety' } },
  {
    populate: {
      path: 'support_escalation_review/tone_and_safety',
      values: {
        tone: 'calm, precise, and policy-grounded',
        must_do: ['acknowledge the customer issue', 'ask for missing evidence before deciding'],
        avoid: ['guaranteeing outcomes', 'blaming the customer'],
      },
    },
  },
  { define: { path: 'support_escalation_review/open_risks' } },
  {
    populate: {
      path: 'support_escalation_review/open_risks',
      values: {
        items: [
          'agents may skip the policy citation under time pressure',
          'refund threshold copy can drift across prompt versions',
        ],
        mitigation:
          'commit the reviewed prompt meaning and validate leaf outputs against constraints',
      },
    },
  },
  {
    relate: {
      from: 'support_escalation_review/refund_policy',
      to: 'support_escalation_review/open_risks',
      type: 'conditions',
    },
  },
];

const PROMPT_REVIEW_CONSTRAINTS: Constraint[] = [
  {
    id: 'cst_demo_refund_threshold',
    type: 'require',
    match_mode: 'exact',
    value: 'Refunds above $100',
    description: 'The brief must preserve the escalation threshold.',
  },
  {
    id: 'cst_demo_policy_citation',
    type: 'require',
    match_mode: 'exact',
    value: 'policy citation',
    description: 'The brief must keep the evidence requirement visible.',
  },
  {
    id: 'cst_demo_no_fake_policy',
    type: 'exclude',
    match_mode: 'exact',
    value: 'invent policy details',
    reason: 'The support assistant must not fabricate policy language.',
  },
];

export const DEMO_WORKSPACE_FIXTURE: DemoWorkspaceFixture = {
  id: 'prompt_review',
  project: {
    name: 'Prompt Review',
    metadata: {
      is_demo: true,
      demo_fixture_id: 'prompt_review',
      demo_fixture_version: 1,
      demo_kind: 'professional_workspace',
    },
  },
  source: {
    title: 'Prompt review intake',
    text:
      'Support escalation review: tighten refund escalation behavior for a customer support assistant. ' +
      'Refunds above $100 require manual review. Replies must ask for order id, cite policy, and name the refund amount before deciding. ' +
      'Tone should be calm, precise, and policy-grounded. Do not invent policy details or guarantee outcomes. ' +
      'Open risks: agents may skip the policy citation under time pressure, and refund threshold copy can drift across prompt versions. Pilot on Friday with the customer support team.',
  },
  replay: {
    label: 'Fixture replay · no LLM call',
    yops: PROMPT_REVIEW_YOPS,
    trees: PROMPT_REVIEW_TREES,
    relations: PROMPT_REVIEW_RELATIONS,
    draft_nodes: [
      {
        id: 'ds_demo_refund_threshold',
        text: 'Refunds above $100 require manual review.',
      },
      {
        id: 'ds_demo_required_evidence',
        text: 'Replies must ask for order id, cite policy, and name the refund amount before deciding.',
      },
      {
        id: 'ds_demo_tone_safety',
        text: 'Tone should be calm, precise, and policy-grounded; do not invent policy details or guarantee outcomes.',
      },
      {
        id: 'ds_demo_open_risks',
        text: 'Open risks are skipped policy citations and refund threshold drift across prompt versions.',
      },
    ],
  },
  commit: {
    message: 'Seed prompt review demo workspace',
    author: { type: 'system', name: 'T3X fixture replay' },
    provenance: { method: 'fixture_replay', model: 'none' },
  },
  leaf: {
    type: 'article',
    title: 'Escalation policy brief',
    constraints: PROMPT_REVIEW_CONSTRAINTS,
    config: {
      prompt_template:
        'Write a concise internal review brief from committed prompt-review knowledge.',
      model: 'fixture-replay',
      max_tokens: 900,
    },
    output:
      'Escalation policy brief\n\n' +
      'Refunds above $100 require manual review. The assistant should ask for the order id, include a policy citation, and name the refund amount before deciding.\n\n' +
      'The reviewed tone is calm, precise, and policy-grounded. The prompt should block invented details by requiring missing evidence before any outcome is promised.\n\n' +
      'Main risks are skipped citations under time pressure and refund threshold drift across prompt versions. Commit this policy meaning and validate future outputs against the same constraints.',
    assertions: [
      {
        id: 'ast_demo_refund_threshold',
        constraint_id: 'cst_demo_refund_threshold',
        passed: true,
        details: 'Output includes the refund threshold.',
      },
      {
        id: 'ast_demo_policy_citation',
        constraint_id: 'cst_demo_policy_citation',
        passed: true,
        details: 'Output includes the policy citation requirement.',
      },
      {
        id: 'ast_demo_no_fake_policy',
        constraint_id: 'cst_demo_no_fake_policy',
        passed: true,
        details: 'Output warns against invented details without repeating the excluded phrase.',
      },
    ],
  },
};

export const DEMO_WORKSPACE_REPLAY_GOAL = `fixture:${DEMO_WORKSPACE_FIXTURE.id}`;

const MEETING_NOTES_LANDING_YOPS: YOp[] = [
  { define: { path: 'release_readiness' } },
  {
    populate: {
      path: 'release_readiness',
      values: {
        decision: 'ship the WebUI polish pass before the open-source announcement',
        owner: 'frontend',
        deadline: 'Friday',
      },
    },
  },
  { define: { path: 'release_readiness/risks' } },
  {
    populate: {
      path: 'release_readiness/risks',
      values: {
        items: ['dark mode parity', 'complex merge screenshots'],
        mitigation: 'regression coverage',
      },
    },
  },
];

const PROMPT_DIFF_SOURCE_TEXT =
  'Prompt version A:\n' +
  'Role: customer support agent. Tone: concise. Escalation rule: send refunds to manual review.\n\n' +
  'Prompt version B:\n' +
  'Role: customer support agent. Tone: calm and precise. Escalation rule: send refunds over $100 to manual review. Add a good reply example.';

const PROMPT_DIFF_LANDING_YOPS: YOp[] = [
  { define: { path: 'assistant_prompt' } },
  {
    populate: {
      path: 'assistant_prompt',
      values: {
        role: 'customer support agent',
        tone: 'calm and precise',
        escalation_rule: 'send refunds over $100 to manual review',
      },
    },
  },
  { define: { path: 'assistant_prompt/examples' } },
  {
    populate: {
      path: 'assistant_prompt/examples',
      values: {
        good_reply: 'I can help, but first I need the order id and policy reference.',
      },
    },
  },
];

export const LANDING_DEMO_CASES: LandingDemoCase[] = [
  {
    id: 'prompt_review',
    title: 'Prompt Review',
    description: 'Policy source becomes reviewable YOps and a durable commit.',
    source: DEMO_WORKSPACE_FIXTURE.source,
    yops: DEMO_WORKSPACE_FIXTURE.replay.yops,
    commit: {
      message: DEMO_WORKSPACE_FIXTURE.commit.message,
      branch: 'main',
    },
  },
  {
    id: 'meeting_notes',
    title: 'Meeting Notes',
    description: 'Messy release notes collapse into decisions, owners, and risks.',
    source: {
      title: MEETING_NOTES_EXTRACTION_DEMO.name,
      text: MEETING_NOTES_EXTRACTION_DEMO.sourceText,
    },
    yops: MEETING_NOTES_LANDING_YOPS,
    commit: {
      message: 'Commit release readiness decisions',
      branch: 'main',
    },
  },
  {
    id: 'prompt_diff',
    title: 'Prompt Diff',
    description: 'Prompt variants become auditable semantic changes.',
    source: {
      title: PROMPT_DIFF_DEMO.name,
      text: PROMPT_DIFF_SOURCE_TEXT,
    },
    yops: PROMPT_DIFF_LANDING_YOPS,
    commit: {
      message: 'Commit prompt version delta',
      branch: 'main',
    },
  },
];
