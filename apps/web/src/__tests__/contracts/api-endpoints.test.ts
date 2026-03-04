/**
 * Frontend API Endpoint Reference Tests
 *
 * These tests use static analysis to ensure frontend code calls the correct API endpoints.
 * This prevents issues like calling RUNNER_URL when API_V1 should be used.
 *
 * IMPORTANT: If these tests fail, it means:
 * 1. An API function is calling the wrong endpoint (Runner vs Engine)
 * 2. The endpoint URL pattern has changed
 * 3. A critical function was removed or renamed
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

// Read all API client source files (modular api/ directory + barrel shim)
const apiDir = path.join(__dirname, '../../lib/api');
const apiCode = fs.readdirSync(apiDir)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => fs.readFileSync(path.join(apiDir, f), 'utf8'))
  .join('\n');

describe('Frontend API Endpoint References', () => {
  // Helper function to extract function body more reliably
  // Looks for the function and its following fetch call within a reasonable range
  function extractFunctionWithFetch(funcName: string, maxChars = 800): string | null {
    // Find function declaration and extract up to maxChars chars after it (enough for the fetch call)
    const pattern = new RegExp(
      `export async function ${funcName}[\\s\\S]{0,${maxChars}}?handleResponse`,
      'm'
    );
    const match = apiCode.match(pattern);
    return match ? match[0] : null;
  }

  describe('Engine Run API (should use API_V1, not RUNNER_URL)', () => {
    it('listEngineRuns calls Engine API endpoint', () => {
      const functionCode = extractFunctionWithFetch('listEngineRuns');
      expect(functionCode).not.toBeNull();

      // Should use API_V1
      expect(functionCode).toMatch(/\$\{API_V1\}\/runs/);
      // Should NOT use RUNNER_URL
      expect(functionCode).not.toMatch(/RUNNER_URL/);
    });

    it('getEngineRun calls Engine API endpoint', () => {
      const functionCode = extractFunctionWithFetch('getEngineRun');
      expect(functionCode).not.toBeNull();

      expect(functionCode).toMatch(/\$\{API_V1\}\/runs/);
      expect(functionCode).not.toMatch(/RUNNER_URL/);
    });

    it('createEngineRun calls Engine API endpoint', () => {
      const functionCode = extractFunctionWithFetch('createEngineRun');
      expect(functionCode).not.toBeNull();

      expect(functionCode).toMatch(/\$\{API_V1\}\/runs/);
      expect(functionCode).not.toMatch(/RUNNER_URL/);
    });
  });

  describe('Deploy Agent API (should use API_V1)', () => {
    it('listDeployAgents calls Engine API endpoint', () => {
      const functionCode = extractFunctionWithFetch('listDeployAgents');
      expect(functionCode).not.toBeNull();

      expect(functionCode).toMatch(/\$\{API_V1\}\/deploy-agents/);
      expect(functionCode).not.toMatch(/RUNNER_URL/);
    });

    it('createDeployAgent calls Engine API endpoint', () => {
      const functionCode = extractFunctionWithFetch('createDeployAgent');
      expect(functionCode).not.toBeNull();

      expect(functionCode).toMatch(/\$\{API_V1\}\/deploy-agents/);
    });

    it('updateDeployAgent calls Engine API endpoint', () => {
      const functionCode = extractFunctionWithFetch('updateDeployAgent');
      expect(functionCode).not.toBeNull();

      expect(functionCode).toMatch(/\$\{API_V1\}\/deploy-agents/);
    });

    it('deleteDeployAgent calls Engine API endpoint', () => {
      const functionCode = extractFunctionWithFetch('deleteDeployAgent');
      expect(functionCode).not.toBeNull();

      expect(functionCode).toMatch(/\$\{API_V1\}\/deploy-agents/);
    });
  });

  describe('Runner API (should use RUNNER_URL)', () => {
    // These functions should call RUNNER_URL, not API_V1
    it('checkRunnerHealth calls Runner endpoint', () => {
      // Look for the function and capture enough to include the URL
      const pattern = /export async function checkRunnerHealth[\s\S]{0,300}?handleResponse/m;
      const match = apiCode.match(pattern);
      expect(match).not.toBeNull();

      const functionCode = match![0];

      expect(functionCode).toMatch(/RUNNER_URL/);
      expect(functionCode).not.toMatch(/API_V1/);
    });

    it('runEval calls Runner endpoint', () => {
      // runEval is more complex, extend the search range
      const pattern = /export async function runEval[\s\S]{0,800}?handleResponse/m;
      const match = apiCode.match(pattern);
      expect(match).not.toBeNull();

      const functionCode = match![0];

      expect(functionCode).toMatch(/RUNNER_URL/);
    });
  });

  describe('Critical Functions Exist', () => {
    const criticalFunctions = [
      'listEngineRuns',
      'getEngineRun',
      'createEngineRun',
      'listDeployAgents',
      'getDeployAgent',
      'createDeployAgent',
      'updateDeployAgent',
      'deleteDeployAgent',
      'checkRunnerHealth',
    ];

    it.each(criticalFunctions)('function %s is exported', (funcName) => {
      const exportPattern = new RegExp(`export\\s+(async\\s+)?function\\s+${funcName}\\s*\\(`);
      expect(apiCode).toMatch(exportPattern);
    });
  });

  describe('Data Transformation Functions Exist', () => {
    it('parseEngineRun function exists for camelCase to snake_case conversion', () => {
      expect(apiCode).toMatch(/function parseEngineRun/);
    });

    it('EngineRunRaw interface exists for raw API response type', () => {
      expect(apiCode).toMatch(/interface EngineRunRaw/);
    });
  });

  describe('Type Definitions', () => {
    it('EngineRun type has required fields', () => {
      // Check that EngineRun interface has snake_case fields
      const engineRunMatch = apiCode.match(/export interface EngineRun \{[\s\S]*?\n\}/);
      expect(engineRunMatch).not.toBeNull();

      const interfaceCode = engineRunMatch![0];

      // Should have snake_case fields
      expect(interfaceCode).toMatch(/run_id:/);
      expect(interfaceCode).toMatch(/project_id:/);
      expect(interfaceCode).toMatch(/runner_run_id:/);
      expect(interfaceCode).toMatch(/created_at:/);
      expect(interfaceCode).toMatch(/updated_at:/);
    });

    it('DeployAgent type has required fields', () => {
      const deployAgentMatch = apiCode.match(/export interface DeployAgent \{[\s\S]*?\n\}/);
      expect(deployAgentMatch).not.toBeNull();

      const interfaceCode = deployAgentMatch![0];

      expect(interfaceCode).toMatch(/deploy_agent_id:/);
      expect(interfaceCode).toMatch(/endpoint:/);
      expect(interfaceCode).toMatch(/status:/);
    });
  });
});

describe('Deploy Page API Usage', () => {
  const deployPagePath = path.join(__dirname, '../../app/deploy/page.tsx');
  const deployPageCode = fs.readFileSync(deployPagePath, 'utf8');

  it('imports listEngineRuns, not listRuns', () => {
    // Should import listEngineRuns
    expect(deployPageCode).toMatch(/import[\s\S]*listEngineRuns[\s\S]*from/);
    // Should NOT import the old listRuns (which calls Runner)
    expect(deployPageCode).not.toMatch(/import[\s\S]*\blistRuns\b[\s\S]*from.*api/);
  });

  it('imports EngineRun type, not RunTrace', () => {
    expect(deployPageCode).toMatch(/type EngineRun/);
    // RunTrace should not be imported for the runs state
    expect(deployPageCode).not.toMatch(/useState<RunTrace\[\]>/);
  });

  it('calls listEngineRuns for loading runs', () => {
    expect(deployPageCode).toMatch(/listEngineRuns\(\)/);
  });
});

describe('Eval Page API Usage', () => {
  const evalPagePath = path.join(__dirname, '../../app/deploy/eval/[runId]/page.tsx');
  const evalPageCode = fs.readFileSync(evalPagePath, 'utf8');

  it('imports getEngineRun', () => {
    expect(evalPageCode).toMatch(/import[\s\S]*getEngineRun[\s\S]*from/);
  });

  it('calls getEngineRun for loading run data', () => {
    expect(evalPageCode).toMatch(/getEngineRun\(/);
  });
});
