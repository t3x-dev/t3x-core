import { BaseExporter, type ExporterConfig } from './base';
import type { T3XFile } from '../types';

export class OpenAIExporter extends BaseExporter {
  readonly name = 'openai';
  readonly targetPlatform = 'openai';

  async export(
    t3x: T3XFile,
    config: ExporterConfig = {}
  ): Promise<object> {
    const systemParts: string[] = [];

    // Build system message from preferences and notes
    if (t3x.preferences) {
      if (t3x.preferences.languages) {
        systemParts.push(`User prefers: ${t3x.preferences.languages.join(', ')}`);
      }
      if (t3x.preferences.style) {
        systemParts.push(`Code style: ${t3x.preferences.style}`);
      }
      if (t3x.preferences.tone) {
        systemParts.push(`Communication tone: ${t3x.preferences.tone}`);
      }
    }

    // Add notes (truncated if necessary)
    if (t3x.notes && t3x.notes.length > 0) {
      for (const note of t3x.notes) {
        const title = note.title || 'Note';
        const content = note.content.substring(0, 500); // Truncate long notes
        systemParts.push(`${title}: ${content}`);
      }
    }

    return {
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'system',
          content: systemParts.join('\n\n'),
        },
        // User adds their message here
      ],
      temperature: 0.7,
      max_tokens: config.maxTokens || 4000,
    };
  }
}
