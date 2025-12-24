import { BaseExporter, ExporterConfig } from './base';
import { T3XFile } from '../types';

export class ClaudeExporter extends BaseExporter {
  readonly name = 'claude';
  readonly targetPlatform = 'anthropic';

  async export(
    t3x: T3XFile,
    config: ExporterConfig = {}
  ): Promise<string> {
    const parts: string[] = [];

    // Add preferences
    if (t3x.preferences) {
      parts.push('# User Preferences');

      if (t3x.preferences.languages) {
        parts.push(`Languages: ${t3x.preferences.languages.join(', ')}`);
      }
      if (t3x.preferences.frameworks) {
        parts.push(`Frameworks: ${t3x.preferences.frameworks.join(', ')}`);
      }
      if (t3x.preferences.style) {
        parts.push(`Style: ${t3x.preferences.style}`);
      }
      if (t3x.preferences.tone) {
        parts.push(`Tone: ${t3x.preferences.tone}`);
      }
      parts.push('');
    }

    // Add notes
    if (t3x.notes && t3x.notes.length > 0) {
      for (const note of t3x.notes) {
        parts.push(`## ${note.title || 'Note'}`);
        parts.push(note.content);
        parts.push('');
      }
    }

    // Optionally add recent conversation context
    if (t3x.conversations && t3x.conversations.length > 0) {
      const recentConvos = t3x.conversations.slice(-3); // Last 3
      parts.push('# Recent Context');
      for (const conv of recentConvos) {
        parts.push(`- ${conv.title || 'Untitled Conversation'}`);
      }
      parts.push('');
    }

    return parts.join('\n');
  }
}
