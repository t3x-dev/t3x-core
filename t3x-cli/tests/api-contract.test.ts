/**
 * API Contract Tests
 *
 * Validates that TypeScript API responses match Python core_api format.
 * These tests verify the response structure without requiring LLM API keys.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "../src/server/index";
import { openDB } from "../src/core/db";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Test configuration
const TEST_PORT = 18765;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let server: Server;
let testDir: string;
let testProjectId: string;
let testConversationId: string;

// Helper to make requests
async function apiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const body = await res.json();
  return { status: res.status, body };
}

describe("API Contract Tests", () => {
  beforeAll(async () => {
    // Create temp directory for test
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-test-"));
    const t3xDir = path.join(testDir, ".t3x");
    fs.mkdirSync(t3xDir, { recursive: true });

    // Initialize database
    openDB(testDir);

    // Create and start server
    server = createServer({
      port: TEST_PORT,
      host: "127.0.0.1",
      providers: {
        embeddingProvider: "mock",
        nlpProvider: "local",
        defaultLanguage: "auto",
      },
      t3xDir,
    });

    await server.start();

    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  afterAll(async () => {
    await server.stop();
    // Clean up temp directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  // ==========================================================================
  // Health Check
  // ==========================================================================

  describe("GET /health", () => {
    it("should return HealthResponse format (not wrapped)", async () => {
      const { status, body } = await apiRequest("/health");

      expect(status).toBe(200);
      expect(body).toMatchObject({
        status: "ok",
        version: expect.any(String),
        uptime: expect.any(Number),
      });

      // Should NOT be wrapped in APIResponse
      expect(body).not.toHaveProperty("data");
    });
  });

  // ==========================================================================
  // Status
  // ==========================================================================

  describe("GET /api/v1/status", () => {
    it("should return APIResponse with StatusResponse data", async () => {
      const { status, body } = await apiRequest("/api/v1/status");

      expect(status).toBe(200);
      expect(body).toMatchObject({
        status: "ok",
        data: {
          projects_count: expect.any(Number),
          conversations_count: expect.any(Number),
          turns_count: expect.any(Number),
          commits_count: expect.any(Number),
          storage: {
            database_size_bytes: expect.any(Number),
            ledger_files_count: expect.any(Number),
          },
        },
      });
    });
  });

  // ==========================================================================
  // Projects
  // ==========================================================================

  describe("Projects API", () => {
    it("GET /api/v1/projects should return list with pagination", async () => {
      const { status, body } = await apiRequest("/api/v1/projects");

      expect(status).toBe(200);
      expect(body).toMatchObject({
        status: "ok",
        data: {
          projects: expect.any(Array),
          limit: expect.any(Number),
          offset: expect.any(Number),
        },
      });
    });

    it("POST /api/v1/projects should create project", async () => {
      const { status, body } = await apiRequest("/api/v1/projects", {
        method: "POST",
        body: JSON.stringify({ name: "test-project" }),
      });

      expect(status).toBe(201);
      expect(body).toMatchObject({
        status: "ok",
        data: {
          project_id: expect.stringMatching(/^proj_[a-f0-9]+$/),
          name: "test-project",
          created_at: expect.any(String),
        },
      });

      testProjectId = (body as any).data.project_id;
    });
  });

  // ==========================================================================
  // Conversations
  // ==========================================================================

  describe("Conversations API", () => {
    it("POST /api/v1/conversations should create conversation", async () => {
      const { status, body } = await apiRequest("/api/v1/conversations", {
        method: "POST",
        body: JSON.stringify({
          project_id: testProjectId,
          title: "Test Conversation",
        }),
      });

      expect(status).toBe(201);
      expect(body).toMatchObject({
        status: "ok",
        data: {
          conversation_id: expect.stringMatching(/^conv_[a-f0-9]+$/),
          project_id: testProjectId,
          title: "Test Conversation",
          created_at: expect.any(String),
        },
      });

      testConversationId = (body as any).data.conversation_id;
    });

    it("GET /api/v1/conversations should list with project filter", async () => {
      const { status, body } = await apiRequest(
        `/api/v1/conversations?project_id=${testProjectId}`
      );

      expect(status).toBe(200);
      expect(body).toMatchObject({
        status: "ok",
        data: {
          conversations: expect.any(Array),
        },
      });
    });
  });

  // ==========================================================================
  // Chat Providers
  // ==========================================================================

  describe("GET /api/v1/chat/providers", () => {
    it("should return providers list", async () => {
      const { status, body } = await apiRequest("/api/v1/chat/providers");

      expect(status).toBe(200);
      expect(body).toMatchObject({
        status: "ok",
        data: {
          providers: expect.any(Array),
          default: expect.any(String),
        },
      });
    });
  });

  // ==========================================================================
  // Chat (without API key)
  // ==========================================================================

  describe("Chat API (without API key)", () => {
    it("POST /api/v1/chat should return provider error", async () => {
      const { status, body } = await apiRequest("/api/v1/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "Hello" }],
        }),
      });

      expect(status).toBe(400);
      expect(body).toMatchObject({
        status: "error",
        error: {
          code: expect.any(String),
          message: expect.stringContaining("API key"),
        },
      });
    });

    it("POST /api/v1/chat/stream should return provider error", async () => {
      const { status, body } = await apiRequest("/api/v1/chat/stream", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "Hello" }],
        }),
      });

      expect(status).toBe(400);
      expect(body).toMatchObject({
        status: "error",
        error: {
          code: expect.any(String),
          message: expect.stringContaining("API key"),
        },
      });
    });
  });

  // ==========================================================================
  // Agent Drafts (without API key)
  // ==========================================================================

  describe("Agent Drafts API (without API key)", () => {
    it("POST /api/v1/agent/drafts should return provider error", async () => {
      const { status, body } = await apiRequest("/api/v1/agent/drafts", {
        method: "POST",
        body: JSON.stringify({
          project_id: testProjectId,
          conversation_id: testConversationId,
          bridge_id: "plan",
          intent: "Test plan",
        }),
      });

      expect(status).toBe(400);
      expect(body).toMatchObject({
        status: "error",
        error: {
          code: expect.any(String),
          message: expect.stringContaining("API key"),
        },
      });
    });

    it("GET /api/v1/agent/drafts/:id should return not found for invalid id", async () => {
      const { status, body } = await apiRequest(
        "/api/v1/agent/drafts/draft_invalid123"
      );

      expect(status).toBe(404);
      expect(body).toMatchObject({
        status: "error",
        error: {
          code: "NOT_FOUND",
          message: expect.any(String),
        },
      });
    });
  });

  // ==========================================================================
  // Export
  // ==========================================================================

  describe("Export API", () => {
    it("GET /api/v1/export/cfpack should return cfpack format", async () => {
      const { status, body } = await apiRequest(
        `/api/v1/export/cfpack?project_id=${testProjectId}`
      );

      expect(status).toBe(200);
      expect(body).toMatchObject({
        version: "1.0.0",
        cfpack_schema_version: "1.0.0",
        project: {
          project_id: testProjectId,
          name: expect.any(String),
          created_at: expect.any(String),
        },
        turns: expect.any(Array),
        findings: {
          aggregated_keywords: expect.any(Array),
          must_have: expect.any(Array),
          mustnt_have: expect.any(Array),
          evidence_refs: expect.any(Array),
        },
        commits: expect.any(Array),
        hash: {
          algorithm: "sha256-jcs-v1",
          pack_hash: expect.stringMatching(/^sha256:[a-f0-9]+$/),
        },
        meta: {
          exported_at: expect.any(String),
          exported_by: expect.any(String),
        },
      });
    });

    it("GET /api/v1/export/cfpack should return error for invalid project", async () => {
      const { status, body } = await apiRequest(
        "/api/v1/export/cfpack?project_id=invalid_project"
      );

      expect(status).toBe(404);
      expect(body).toMatchObject({
        status: "error",
        error: {
          code: "NOT_FOUND",
          message: expect.any(String),
        },
      });
    });
  });

  // ==========================================================================
  // Error Response Format
  // ==========================================================================

  describe("Error Response Format", () => {
    it("should return consistent error format for 404", async () => {
      const { status, body } = await apiRequest("/api/v1/nonexistent");

      expect(status).toBe(404);
      expect(body).toMatchObject({
        status: "error",
        error: {
          code: expect.any(String),
          message: expect.any(String),
        },
      });
    });
  });
});
