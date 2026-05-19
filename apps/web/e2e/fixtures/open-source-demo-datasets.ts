type DemoSlotValue = string | number | boolean | DemoSlotValue[] | { [key: string]: DemoSlotValue };

export interface DemoTreeNode {
  key: string;
  slots: Record<string, DemoSlotValue>;
  children?: DemoTreeNode[];
}

export interface DemoFlatNode {
  id: string;
  text: string;
}

function demoTrees(trees: DemoTreeNode[]): DemoTreeNode[] {
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
        },
        {
          key: 'examples',
          slots: {
            good_reply: 'I can help, but first I need the order id and policy reference.',
          },
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
            },
          ],
        },
        {
          key: 'transport',
          slots: {
            payment_methods: ['Opal', 'contactless payment'],
            modes: ['ferries', 'trains', 'buses'],
          },
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
            },
            {
              key: 'food_ideas',
              slots: {
                fresh: ['sushi', 'Mediterranean bowl', 'tacos with fresh toppings'],
                comforting: ['pizza', 'ramen'],
              },
            },
          ],
        },
        {
          key: 'transport',
          slots: {
            payment_methods: ['Opal', 'contactless payment'],
            modes: ['ferries', 'trains', 'buses'],
          },
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
            },
            {
              key: 'weather_backup',
              slots: {
                plan: 'museum and cafe route',
                trigger: 'heavy rain',
              },
            },
          ],
        },
        {
          key: 'transport',
          slots: {
            payment_methods: ['Opal', 'contactless payment'],
            modes: ['ferries', 'trains', 'buses'],
          },
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
