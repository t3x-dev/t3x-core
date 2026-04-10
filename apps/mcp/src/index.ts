#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { browserAuth, clearStoredToken, ensureAuth } from './auth.js';
import { getBaseUrl, getClient, updateToken } from './client.js';
import { checkTool, handleCheck } from './tools/check.js';
import { commitTool, handleCommit } from './tools/commit.js';
import { createBranchTool, handleCreateBranch } from './tools/create-branch.js';
import { createConversationTool, handleCreateConversation } from './tools/create-conversation.js';
import { createLeafTool, handleCreateLeaf } from './tools/create-leaf.js';
import { createProjectTool, handleCreateProject } from './tools/create-project.js';
import { deleteDraftTool, handleDeleteDraft } from './tools/delete-draft.js';
import { deleteLeafTool, handleDeleteLeaf } from './tools/delete-leaf.js';
import { deleteProjectTool, handleDeleteProject } from './tools/delete-project.js';
import { diffTool, handleDiff } from './tools/diff.js';
import { applyYopsTool, handleApplyYops } from './tools/apply-yops.js';
import { extractTool, handleExtract } from './tools/extract.js';
import { generateTool, handleGenerate } from './tools/generate.js';
import { handleListBranches, listBranchesTool } from './tools/list-branches.js';
import { handleListCommits, listCommitsTool } from './tools/list-commits.js';
import { handleListConversations, listConversationsTool } from './tools/list-conversations.js';
import { handleListDrafts, listDraftsTool } from './tools/list-drafts.js';
import { handleListLeaves, listLeavesTool } from './tools/list-leaves.js';
import { handleListProjects, listProjectsTool } from './tools/list-projects.js';
import { handleMergeExecute, mergeExecuteTool } from './tools/merge-execute.js';
import { handleMergePrepare, mergePrepareTool } from './tools/merge-prepare.js';
import { handleSchema, schemaTool } from './tools/schema.js';
import { handleShow, showTool } from './tools/show.js';
import { handleShowCommit, showCommitTool } from './tools/show-commit.js';
import { handleShowDraft, showDraftTool } from './tools/show-draft.js';
import { handleShowLeaf, showLeafTool } from './tools/show-leaf.js';
import { handleShowProject, showProjectTool } from './tools/show-project.js';
import { handleUpdateProject, updateProjectTool } from './tools/update-project.js';
import { handleValidate, validateTool } from './tools/validate.js';

const tools = [
  extractTool,
  commitTool,
  checkTool,
  generateTool,
  showTool,
  schemaTool,
  validateTool,
  listProjectsTool,
  createProjectTool,
  deleteProjectTool,
  showDraftTool,
  applyYopsTool,
  listCommitsTool,
  diffTool,
  createBranchTool,
  listBranchesTool,
  listLeavesTool,
  createLeafTool,
  showCommitTool,
  mergePrepareTool,
  mergeExecuteTool,
  listConversationsTool,
  createConversationTool,
  showLeafTool,
  deleteLeafTool,
  showProjectTool,
  listDraftsTool,
  deleteDraftTool,
  updateProjectTool,
];

const handlers: Record<
  string,
  (args: Record<string, unknown>) => Promise<{ content: { type: 'text'; text: string }[] }>
> = {
  [extractTool.name]: handleExtract,
  [commitTool.name]: handleCommit,
  [checkTool.name]: handleCheck,
  [generateTool.name]: handleGenerate,
  [showTool.name]: handleShow,
  [schemaTool.name]: handleSchema,
  [validateTool.name]: handleValidate,
  [listProjectsTool.name]: handleListProjects,
  [createProjectTool.name]: handleCreateProject,
  [showDraftTool.name]: handleShowDraft,
  [applyYopsTool.name]: handleApplyYops,
  [listCommitsTool.name]: handleListCommits,
  [diffTool.name]: handleDiff,
  [createBranchTool.name]: handleCreateBranch,
  [listBranchesTool.name]: handleListBranches,
  [deleteProjectTool.name]: handleDeleteProject,
  [listLeavesTool.name]: handleListLeaves,
  [createLeafTool.name]: handleCreateLeaf,
  [showCommitTool.name]: handleShowCommit,
  [mergePrepareTool.name]: handleMergePrepare,
  [mergeExecuteTool.name]: handleMergeExecute,
  [listConversationsTool.name]: handleListConversations,
  [createConversationTool.name]: handleCreateConversation,
  [showLeafTool.name]: handleShowLeaf,
  [deleteLeafTool.name]: handleDeleteLeaf,
  [showProjectTool.name]: handleShowProject,
  [listDraftsTool.name]: handleListDrafts,
  [deleteDraftTool.name]: handleDeleteDraft,
  [updateProjectTool.name]: handleUpdateProject,
};

const server = new Server({ name: 't3x-mcp', version: '0.1.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = handlers[name];

  if (!handler) {
    return {
      content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  const baseUrl = getBaseUrl();

  // Ensure auth token is available before calling
  let token = ensureAuth(baseUrl);
  if (!token) {
    try {
      token = await browserAuth(baseUrl);
      updateToken(token);
    } catch (authErr) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Authentication failed: ${authErr instanceof Error ? authErr.message : String(authErr)}`,
          },
        ],
        isError: true,
      };
    }
  } else {
    getClient(token);
  }

  try {
    return await handler(args ?? {});
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    // If 401, token may be expired/revoked — re-auth and retry once
    if (message.includes('401') || message.includes('Unauthorized')) {
      try {
        clearStoredToken();
        const newToken = await browserAuth(baseUrl);
        updateToken(newToken);
        return await handler(args ?? {});
      } catch (retryErr) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Authentication failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
            },
          ],
          isError: true,
        };
      }
    }

    return {
      content: [{ type: 'text' as const, text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  process.stderr.write(`Fatal: ${error}\n`);
  process.exit(1);
});
