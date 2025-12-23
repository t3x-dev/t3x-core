/**
 * API Client for Integration Tests
 *
 * 封装 fetch 调用，统一处理请求/响应格式。
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export class ApiClient {
  constructor(private baseUrl = BASE_URL) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ status: number; json: ApiResponse<T> }> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await response.json();
    return { status: response.status, json };
  }

  // Health
  async health() {
    const res = await fetch(`${this.baseUrl}/api/v1/health`);
    return res.json();
  }

  // Projects
  async createProject(name: string) {
    return this.request<{ project_id: string; name: string; created_at: string }>(
      'POST', '/api/v1/projects', { name }
    );
  }

  // Conversations
  async createConversation(projectId: string, title?: string) {
    return this.request<{ conversation_id: string; project_id: string; title: string; created_at: string }>(
      'POST', '/api/v1/conversations', { project_id: projectId, title }
    );
  }

  async listConversations(projectId: string) {
    return this.request<{ conversations: Array<{ conversation_id: string }> }>(
      'GET', `/api/v1/conversations?project_id=${projectId}`
    );
  }

  // Turns
  async createTurn(projectId: string, conversationId: string, role: string, content: string) {
    return this.request<{
      turn_hash: string;
      parent_turn_hash: string | null;
      project_id: string;
      conversation_id: string;
      role: string;
      content: string;
      language: string | null;
      rings: unknown;
      created_at: string;
    }>('POST', '/api/v1/turns', {
      project_id: projectId,
      conversation_id: conversationId,
      role,
      content,
    });
  }

  async listTurns(conversationId: string) {
    return this.request<{ turns: Array<{ turn_hash: string; parent_turn_hash: string | null }> }>(
      'GET', `/api/v1/turns?conversation_id=${conversationId}`
    );
  }

  // Commits
  async createCommit(
    projectId: string,
    turnWindow: { start_turn_hash: string; end_turn_hash: string },
    branch = 'main'
  ) {
    return this.request<{
      commit_hash: string;
      project_id: string;
      branch: string;
      parents_json: string;
      turn_window_json: string;
      facet_snapshot_json: string;
      pipeline_config_json: string | null;
      draft_id: string | null;
      draft_text_hash: string | null;
      signature_json: string | null;
      created_at: string;
    }>('POST', '/api/v1/commits', {
      project_id: projectId,
      branch,
      turn_window: turnWindow,
      facet_snapshot: [],
    });
  }

  async listCommits(projectId: string) {
    return this.request<{ commits: Array<{ commit_hash: string }> }>(
      'GET', `/api/v1/commits?project_id=${projectId}`
    );
  }
}

export const apiClient = new ApiClient();
