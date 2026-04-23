import type { Command } from 'commander';
import { resolveLocalConfigState, updateLocalConfig } from '../local-config.js';
import { success } from '../utils.js';

export function registerConfigCommands(parent: Command): void {
  const setCmd = parent.command('set').description('Set local shared config values');

  setCmd
    .command('api-url <url>')
    .description('Store the default API URL in local shared config')
    .action((url: string) => {
      updateLocalConfig({ api_url: url });
      success(`Stored API URL: ${url}`);
    });

  parent
    .command('show')
    .description('Show the effective local shared config state')
    .option('--json', 'Output as JSON')
    .action((options) => {
      const state = resolveLocalConfigState();
      if (options.json) {
        console.log(JSON.stringify(state, null, 2));
        return;
      }

      console.log(`API URL: ${state.api_url}`);
      console.log(`API URL Source: ${state.api_url_source}`);
      console.log(`API Key Present: ${state.api_key_present ? 'yes' : 'no'}`);
      console.log(`API Key Source: ${state.api_key_source}`);
      console.log(`API Key Preview: ${state.api_key_preview ?? '(none)'}`);
      console.log(`Config Path: ${state.config_path}`);
    });
}
