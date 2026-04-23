import fs from 'node:fs';
import { resolveStartOptions } from '../runtime/env.js';
import { checkHttpHealth } from '../runtime/health.js';
import { getLocalPaths, getMissingStartArtifacts } from '../runtime/paths.js';
import {
  getRuntimeMetadataPaths,
  getRuntimeProcessStatus,
  readRuntimeState,
} from '../runtime/pid.js';
import { getPortStatus } from '../runtime/ports.js';
import { getVersionLockReport, getVersionSnapshot } from '../runtime/version-check.js';

export interface DoctorCommandOptions {
  dataDir?: string;
  apiPort?: number;
  webPort?: number;
}

export async function runDoctorCommand(input: DoctorCommandOptions = {}): Promise<void> {
  const paths = getLocalPaths();
  const metadataPaths = getRuntimeMetadataPaths(paths);
  const configured = resolveStartOptions(input, paths, process.env);
  const state = await readRuntimeState(paths);
  const versions = getVersionSnapshot(paths);
  const versionLock = getVersionLockReport(paths);
  const effective = {
    dataDir: input.dataDir ? configured.dataDir : (state?.dataDir ?? configured.dataDir),
    apiPort: input.apiPort ?? state?.apiPort ?? configured.apiPort,
    webPort: input.webPort ?? state?.webPort ?? configured.webPort,
  };
  const missingArtifacts = getMissingStartArtifacts(paths);
  const processStatus = state ? getRuntimeProcessStatus(state) : null;
  const [apiPortStatus, webPortStatus, apiHealth, webHealth] = await Promise.all([
    getPortStatus(effective.apiPort),
    getPortStatus(effective.webPort),
    checkHttpHealth(`http://127.0.0.1:${effective.apiPort}/health`),
    checkHttpHealth(`http://127.0.0.1:${effective.webPort}/health`),
  ]);

  const problems: string[] = [];
  if (missingArtifacts.length > 0) {
    problems.push(
      ...missingArtifacts.map((item) => `Missing build artifact: ${item.label} (${item.path})`)
    );
  }
  if (!fs.existsSync(paths.cliEntryPath)) {
    problems.push(`Missing CLI shim target: ${paths.cliEntryPath}`);
  }
  if (!fs.existsSync(paths.mcpEntryPath)) {
    problems.push(`Missing MCP shim target: ${paths.mcpEntryPath}`);
  }
  if (state && processStatus && (!processStatus.apiRunning || !processStatus.webRunning)) {
    problems.push('Runtime state file exists but one or more recorded PIDs are not running');
  }
  if (!state && !apiPortStatus.available) {
    problems.push(`API port ${effective.apiPort} is occupied outside the local runtime`);
  }
  if (!state && !webPortStatus.available) {
    problems.push(`Web port ${effective.webPort} is occupied outside the local runtime`);
  }
  if (state && processStatus?.apiRunning && !apiHealth.ok) {
    problems.push(`API process is running but health check failed: ${apiHealth.details}`);
  }
  if (state && processStatus?.webRunning && !webHealth.ok) {
    problems.push(`Web process is running but health check failed: ${webHealth.details}`);
  }
  if (versionLock.problems.length > 0) {
    problems.push(...versionLock.problems);
  }

  const status = getDoctorStatus(state, processStatus, apiHealth.ok, webHealth.ok);

  console.log('[t3x-local] Doctor');
  console.log(`Status: ${status}`);
  console.log(
    `Versions: local=${versions.local} api=${versions.api} web=${versions.web} cli=${versions.cli} mcp=${versions.mcp}`
  );
  console.log(
    `Fixed version: ${versions.fixedVersion} (${versionLock.problems.length === 0 ? 'ok' : 'mismatch'})`
  );
  console.log(`Node: ${versions.node} (${versions.platform})`);
  console.log(`Repo root: ${paths.repoRoot}`);
  console.log(`Runtime source: ${paths.runtimeSource}`);
  console.log(`Installed runtime dir: ${paths.installedRuntimeDir}`);
  console.log(
    `Configured data dir: ${effective.dataDir} (${fs.existsSync(effective.dataDir) ? 'exists' : 'missing'})`
  );
  console.log(
    `State file: ${metadataPaths.stateFilePath} (${fs.existsSync(metadataPaths.stateFilePath) ? 'present' : 'absent'})`
  );
  console.log(`API log: ${metadataPaths.apiLogPath}`);
  console.log(`Web log: ${metadataPaths.webLogPath}`);
  console.log(
    `CLI target: ${paths.cliEntryPath} (${fs.existsSync(paths.cliEntryPath) ? 'ok' : 'missing'})`
  );
  console.log(
    `MCP target: ${paths.mcpEntryPath} (${fs.existsSync(paths.mcpEntryPath) ? 'ok' : 'missing'})`
  );
  console.log(
    `API: port=${effective.apiPort} pid=${state?.apiPid ?? 'n/a'} portStatus=${apiPortStatus.details} health=${formatHealth(apiHealth)}`
  );
  console.log(
    `Web: port=${effective.webPort} pid=${state?.webPid ?? 'n/a'} portStatus=${webPortStatus.details} health=${formatHealth(webHealth)}`
  );

  if (missingArtifacts.length === 0) {
    console.log('Artifacts: all required local build artifacts are present');
  } else {
    console.log('Artifacts: missing required build outputs');
  }

  if (problems.length > 0) {
    console.log('Problems:');
    for (const problem of problems) {
      console.log(`- ${problem}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Problems: none');
}

function getDoctorStatus(
  state: Awaited<ReturnType<typeof readRuntimeState>>,
  processStatus: ReturnType<typeof getRuntimeProcessStatus> | null,
  apiHealthy: boolean,
  webHealthy: boolean
): string {
  if (!state) {
    return 'stopped';
  }

  if (!processStatus?.apiRunning && !processStatus?.webRunning) {
    return 'stale-state';
  }

  if (processStatus.apiRunning && processStatus.webRunning && apiHealthy && webHealthy) {
    return 'running';
  }

  return 'degraded';
}

function formatHealth(result: Awaited<ReturnType<typeof checkHttpHealth>>): string {
  return result.ok ? `ok (${result.details})` : `failed (${result.details})`;
}
