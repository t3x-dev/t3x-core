import type { Command } from 'commander';
import {
  checkLocalAccess,
  clearStoredApiKey,
  resolveLocalConfigState,
  updateLocalConfig,
} from '../local-config.js';
import { success } from '../utils.js';

export function registerAuthCommands(parent: Command): void {
  parent
    .command('use-key <key>')
    .description('Store a shared API key for local CLI, WebUI, and MCP use')
    .action((key: string) => {
      updateLocalConfig({ api_key: key });
      success('Stored local API key');
    });

  parent
    .command('status')
    .description('Show the effective local authentication state')
    .option('--json', 'Output as JSON')
    .action((options) => {
      const state = resolveLocalConfigState();
      if (options.json) {
        console.log(JSON.stringify(state, null, 2));
        return;
      }

      console.log(`Configured: ${state.api_key_present ? 'yes' : 'no'}`);
      console.log(`Source: ${state.api_key_source}`);
      console.log(`Preview: ${state.api_key_preview ?? '(none)'}`);
      console.log(`Config Path: ${state.config_path}`);
    });

  parent
    .command('logout')
    .description('Clear the file-backed local API key')
    .action(() => {
      clearStoredApiKey();
      success('Cleared stored local API key');
    });

  parent
    .command('check')
    .description('Check whether the current API URL and key can access the target API')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const result = await checkLocalAccess();
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`Result: ${result.ok ? 'ok' : 'failed'}`);
      console.log(`Code: ${result.code}`);
      console.log(`Auth Mode: ${result.auth_mode}`);
      console.log(`API URL: ${result.api_url}`);
      console.log(`Key Source: ${result.api_key_source}`);
      console.log(`Message: ${result.message}`);
    });
}
