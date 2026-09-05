import type { SemanticContent } from '@t3x-dev/core';

/** Curated, deterministic content. No provider, prompt, credentials, or network calls. */
export function createPrdStarterContent(title: string): SemanticContent {
  return {
    trees: [
      {
        key: 'prd',
        slots: { title, description: 'A starting point to edit and review with your team.' },
        children: [
          {
            key: 'summary',
            slots: { problem: '', audience: [], outcome: '' },
            children: [],
          },
          {
            key: 'requirements',
            slots: {},
            children: [
              {
                key: 'first_requirement',
                slots: {
                  title: 'Describe your first requirement',
                  priority: 'must',
                  acceptance: [],
                },
                children: [],
              },
            ],
          },
        ],
      },
    ],
    relations: [],
  };
}
