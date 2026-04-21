interface PromptDef {
  name: string;
  description: string;
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
  render: (args: Record<string, string>) => {
    description: string;
    messages: Array<{ role: 'user' | 'assistant'; content: { type: 'text'; text: string } }>;
  };
}

function formatResourceUri(uri: string) {
  return `- Read resource: ${uri}`;
}

const PROMPTS: PromptDef[] = [
  {
    name: 'extract_review_commit',
    description:
      'User entry for extracting text into a workbench draft, reviewing it, and committing it.',
    arguments: [
      {
        name: 'project_id',
        description: 'Project that will receive the extracted draft.',
        required: true,
      },
    ],
    render: (args) => {
      const projectId = args.project_id ?? '<project_id>';
      return {
        description:
          'Use this workflow to extract text into a workbench draft, inspect it, refine it, and commit it.',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                'Workflow: extract, review, and commit semantic knowledge.',
                formatResourceUri(`t3x://projects/${projectId}`),
                '1. Call `t3x_extract` with the source text and `project_id`.',
                '2. Read the returned `workbench_draft` resource.',
                '3. If needed, refine with `t3x_edit`.',
                '4. Re-read the workbench draft to confirm the result.',
                '5. Finalize with `t3x_commit`.',
              ].join('\n'),
            },
          },
        ],
      };
    },
  },
  {
    name: 'inspect_workbench_draft',
    description: 'User entry for opening a workbench draft and refining it safely.',
    arguments: [{ name: 'draft_id', description: 'Workbench draft to inspect.', required: true }],
    render: (args) => {
      const draftId = args.draft_id ?? '<draft_id>';
      return {
        description:
          'Use this workflow to inspect a workbench draft, revise it with YOps, and verify the result.',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                'Workflow: inspect and refine a workbench draft.',
                formatResourceUri(`t3x://workbench-drafts/${draftId}`),
                '1. Read the workbench draft resource first.',
                '2. Draft YOps edits based on the current revision.',
                '3. Apply changes with `t3x_edit`.',
                '4. Re-read the draft and confirm the revision moved forward.',
              ].join('\n'),
            },
          },
        ],
      };
    },
  },
  {
    name: 'prepare_resolve_merge',
    description:
      'User entry for comparing two commits, preparing a merge draft, and resolving conflicts.',
    arguments: [
      { name: 'source_hash', description: 'Source commit hash for the merge.', required: true },
      { name: 'target_hash', description: 'Target commit hash for the merge.', required: true },
    ],
    render: (args) => {
      const sourceHash = args.source_hash ?? '<source_hash>';
      const targetHash = args.target_hash ?? '<target_hash>';
      return {
        description:
          'Use this workflow to compare two commits, prepare a merge draft, and resolve conflicts before executing the merge.',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                'Workflow: prepare and resolve a semantic merge.',
                formatResourceUri(`t3x://commits/${sourceHash}`),
                formatResourceUri(`t3x://commits/${targetHash}`),
                '1. Read both commit resources to understand the inputs.',
                '2. Compare them with `t3x_diff`.',
                '3. Start the merge flow with `t3x_merge` action `prepare`.',
                '4. Read the returned `merge_draft` resource.',
                '5. If conflicts exist, use `t3x_merge` actions `show_conflict` and `resolve`.',
                '6. Finish with `t3x_merge` action `execute`.',
              ].join('\n'),
            },
          },
        ],
      };
    },
  },
  {
    name: 'generate_from_leaf',
    description:
      'User entry for reviewing a leaf and generating validated output from committed knowledge.',
    arguments: [
      { name: 'leaf_id', description: 'Leaf to inspect and generate from.', required: true },
    ],
    render: (args) => {
      const leafId = args.leaf_id ?? '<leaf_id>';
      return {
        description:
          'Use this workflow to inspect a leaf, generate output, and verify the result against leaf assertions.',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                'Workflow: generate output from a leaf.',
                formatResourceUri(`t3x://leaves/${leafId}`),
                '1. Read the leaf resource first.',
                '2. Review its constraints and prior assertions.',
                '3. Generate output with `t3x_generate`.',
                '4. Re-read the leaf if you need to inspect updated assertions or output.',
              ].join('\n'),
            },
          },
        ],
      };
    },
  },
];

const PROMPT_MAP = new Map(PROMPTS.map((prompt) => [prompt.name, prompt] as const));

export const PROMPT_DEFS = PROMPTS.map(({ name, description, arguments: args }) => ({
  name,
  description,
  arguments: args,
}));

export function getPrompt(name: string, args: Record<string, string> = {}) {
  const prompt = PROMPT_MAP.get(name);
  if (!prompt) {
    throw new Error(`Unknown prompt: ${name}`);
  }
  return prompt.render(args);
}
