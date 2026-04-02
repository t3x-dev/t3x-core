import { getClient } from '../client.js';

export const importUrlTool = {
  name: 't3x_import_url',
  description: 'Import a conversation from a URL into a project.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      project_id: { type: 'string', description: 'Project ID' },
      url: { type: 'string', description: 'URL to import (e.g. ChatGPT share link)' },
    },
    required: ['project_id', 'url'],
  },
};

export async function handleImportUrl(args: Record<string, unknown>) {
  const client = getClient();
  const result = await client.importUrl({
    project_id: args.project_id as string,
    url: args.url as string,
  });
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}
