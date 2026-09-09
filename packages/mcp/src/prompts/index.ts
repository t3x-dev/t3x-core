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
      'User entry for extracting immutable Source turns into a Workspace Transition for human review.',
    arguments: [
      {
        name: 'project_id',
        description: 'Project that owns the Source, Workspace, and resulting Transition.',
        required: true,
      },
    ],
    render: (args) => {
      const projectId = args.project_id ?? '<project_id>';
      return {
        description:
          'Use this workflow to create and verify a durable Workspace Transition from immutable Source turns.',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                'Workflow: extract immutable Source evidence into a reviewable Transition.',
                'Requires the `transition` toolset with `T3X_MCP_BACKEND=api`.',
                formatResourceUri(`t3x://projects/${projectId}`),
                '1. Use `t3x_query` targets `workspaces` and `source_threads` in this project.',
                '2. Query target `source_evidence` with the Source Thread id and select exact immutable `turn_hashes`.',
                '3. Call `t3x_extract` with `project_id`, `workspace_id`, `source_thread_id`, and `turn_hashes`.',
                '4. Call `propose_transition` with `project_id`, a new `request_id`, `workspace_id`, `kind: structured_yops`, and the returned `candidate_id` as `extraction_candidate_id`.',
                '5. Run `verify_transition` with its own `request_id`, then inspect the same Transition in MCP or Web.',
                '6. After authenticated human approval, call `decide_transition` with the latest review `precondition`.',
                '7. For accepted or authorized overridden Decisions, call `commit_transition` with the returned `decision_digest` and exact `expected_head`.',
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
      {
        name: 'project_id',
        description: 'Project scope for both CommitV2 inputs.',
        required: true,
      },
      { name: 'source_hash', description: 'Source commit hash for the merge.', required: true },
      { name: 'target_hash', description: 'Target commit hash for the merge.', required: true },
    ],
    render: (args) => {
      const projectId = args.project_id ?? '<project_id>';
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
                formatResourceUri(`t3x://projects/${projectId}/commits/${sourceHash}`),
                formatResourceUri(`t3x://projects/${projectId}/commits/${targetHash}`),
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
      'User entry for reviewing a leaf and generating validated output from committed state.',
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
