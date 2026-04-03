#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { browserAuth, clearStoredToken, ensureAuth } from './auth.js';
import { getBaseUrl, getClient, updateToken } from './client.js';
import { addTurnTool, handleAddTurn } from './tools/add-turn.js';
import { chatTool, handleChat } from './tools/chat.js';
import { checkTool, handleCheck } from './tools/check.js';
import { commitTool, handleCommit } from './tools/commit.js';
import { createBranchTool, handleCreateBranch } from './tools/create-branch.js';
import { createConversationTool, handleCreateConversation } from './tools/create-conversation.js';
import { createLeafTool, handleCreateLeaf } from './tools/create-leaf.js';
import { createProjectTool, handleCreateProject } from './tools/create-project.js';
import { createShareTool, handleCreateShare } from './tools/create-share.js';
import { createWebhookTool, handleCreateWebhook } from './tools/create-webhook.js';
import { currentBranchTool, handleCurrentBranch } from './tools/current-branch.js';
import { deleteConversationTool, handleDeleteConversation } from './tools/delete-conversation.js';
import { deleteDraftTool, handleDeleteDraft } from './tools/delete-draft.js';
import { deleteLeafTool, handleDeleteLeaf } from './tools/delete-leaf.js';
import { deleteProjectTool, handleDeleteProject } from './tools/delete-project.js';
import { deleteWebhookTool, handleDeleteWebhook } from './tools/delete-webhook.js';
import { diffTool, handleDiff } from './tools/diff.js';
import { editDraftTool, handleEditDraft } from './tools/edit-draft.js';
import { exportTool, handleExport } from './tools/export.js';
import { extractTool, handleExtract } from './tools/extract.js';
import { generateTool, handleGenerate } from './tools/generate.js';
import { getConversationTool, handleGetConversation } from './tools/get-conversation.js';
import { handleImportUrl, importUrlTool } from './tools/import-url.js';
import { handleListBranches, listBranchesTool } from './tools/list-branches.js';
import { handleListCommits, listCommitsTool } from './tools/list-commits.js';
import { handleListConversations, listConversationsTool } from './tools/list-conversations.js';
import { handleListDrafts, listDraftsTool } from './tools/list-drafts.js';
import { handleListLeaves, listLeavesTool } from './tools/list-leaves.js';
import { handleListProjects, listProjectsTool } from './tools/list-projects.js';
import { handleListTurns, listTurnsTool } from './tools/list-turns.js';
import { handleListWebhooks, listWebhooksTool } from './tools/list-webhooks.js';
import { handleMergeExecute, mergeExecuteTool } from './tools/merge-execute.js';
import { handleMergePrepare, mergePrepareTool } from './tools/merge-prepare.js';
import { handleRestoreProject, restoreProjectTool } from './tools/restore-project.js';
import { handleSchema, schemaTool } from './tools/schema.js';
import { handleShow, showTool } from './tools/show.js';
import { handleShowCommit, showCommitTool } from './tools/show-commit.js';
import { handleShowDraft, showDraftTool } from './tools/show-draft.js';
import { handleShowLeaf, showLeafTool } from './tools/show-leaf.js';
import { handleShowProject, showProjectTool } from './tools/show-project.js';
import { handleSwitchBranch, switchBranchTool } from './tools/switch-branch.js';
import { handleValidate, validateTool } from './tools/validate.js';
import { handleYopsSchema, yopsSchemaTool } from './tools/yops-schema.js';

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
  editDraftTool,
  yopsSchemaTool,
  listCommitsTool,
  diffTool,
  createBranchTool,
  switchBranchTool,
  listBranchesTool,
  listLeavesTool,
  createLeafTool,
  importUrlTool,
  exportTool,
  showCommitTool,
  mergePrepareTool,
  mergeExecuteTool,
  listConversationsTool,
  createConversationTool,
  addTurnTool,
  showLeafTool,
  deleteLeafTool,
  showProjectTool,
  restoreProjectTool,
  getConversationTool,
  deleteConversationTool,
  listTurnsTool,
  currentBranchTool,
  listDraftsTool,
  deleteDraftTool,
  chatTool,
  listWebhooksTool,
  createWebhookTool,
  deleteWebhookTool,
  createShareTool,
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
  [editDraftTool.name]: handleEditDraft,
  [yopsSchemaTool.name]: handleYopsSchema,
  [listCommitsTool.name]: handleListCommits,
  [diffTool.name]: handleDiff,
  [createBranchTool.name]: handleCreateBranch,
  [switchBranchTool.name]: handleSwitchBranch,
  [listBranchesTool.name]: handleListBranches,
  [deleteProjectTool.name]: handleDeleteProject,
  [listLeavesTool.name]: handleListLeaves,
  [createLeafTool.name]: handleCreateLeaf,
  [importUrlTool.name]: handleImportUrl,
  [exportTool.name]: handleExport,
  [showCommitTool.name]: handleShowCommit,
  [mergePrepareTool.name]: handleMergePrepare,
  [mergeExecuteTool.name]: handleMergeExecute,
  [listConversationsTool.name]: handleListConversations,
  [createConversationTool.name]: handleCreateConversation,
  [addTurnTool.name]: handleAddTurn,
  [showLeafTool.name]: handleShowLeaf,
  [deleteLeafTool.name]: handleDeleteLeaf,
  [showProjectTool.name]: handleShowProject,
  [restoreProjectTool.name]: handleRestoreProject,
  [getConversationTool.name]: handleGetConversation,
  [deleteConversationTool.name]: handleDeleteConversation,
  [listTurnsTool.name]: handleListTurns,
  [currentBranchTool.name]: handleCurrentBranch,
  [listDraftsTool.name]: handleListDrafts,
  [deleteDraftTool.name]: handleDeleteDraft,
  [chatTool.name]: handleChat,
  [listWebhooksTool.name]: handleListWebhooks,
  [createWebhookTool.name]: handleCreateWebhook,
  [deleteWebhookTool.name]: handleDeleteWebhook,
  [createShareTool.name]: handleCreateShare,
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
