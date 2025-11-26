import { BaseExporter, ExporterConfig } from './base';
import { ContextFlowFile } from '../types';

export class ClaudeExporter extends BaseExporter {
  readonly name = 'claude';
  readonly targetPlatform = 'anthropic';

  async export(
    contextflow: ContextFlowFile,
    config: ExporterConfig = {}
  ): Promise<string> {
    const parts: string[] = [];

    // Add preferences
    if (contextflow.preferences) {
      parts.push('# User Preferences');

      if (contextflow.preferences.languages) {
        parts.push(`Languages: ${contextflow.preferences.languages.join(', ')}`);
      }
      if (contextflow.preferences.frameworks) {
        parts.push(`Frameworks: ${contextflow.preferences.frameworks.join(', ')}`);
      }
      if (contextflow.preferences.style) {
        parts.push(`Style: ${contextflow.preferences.style}`);
      }
      if (contextflow.preferences.tone) {
        parts.push(`Tone: ${contextflow.preferences.tone}`);
      }
      parts.push('');
    }

    // Add notes
    if (contextflow.notes && contextflow.notes.length > 0) {
      for (const note of contextflow.notes) {
        parts.push(`## ${note.title || 'Note'}`);
        parts.push(note.content);
        parts.push('');
      }
    }

    // Optionally add recent conversation context
    if (contextflow.conversations && contextflow.conversations.length > 0) {
      const recentConvos = contextflow.conversations.slice(-3); // Last 3
      parts.push('# Recent Context');
      for (const conv of recentConvos) {
        parts.push(`- ${conv.title || 'Untitled Conversation'}`);
      }
      parts.push('');
    }

    return parts.join('\n');
  }
}
