import { BaseImporter, ImporterConfig } from './base';
import { T3XFile, Conversation, Message } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface ChatGPTExport {
  title: string;
  create_time: number;
  mapping: Record<string, {
    id: string;
    message?: {
      id: string;
      author: { role: string };
      content: { parts: string[] };
      create_time: number;
    };
    parent?: string;
  }>;
}

export class ChatGPTImporter extends BaseImporter {
  readonly name = 'chatgpt';
  readonly supportedFormats = ['application/json'];

  canImport(input: any): boolean {
    if (Array.isArray(input)) {
      return input.some(
        (item) => item.mapping && item.title !== undefined && item.create_time
      );
    }
    return false;
  }

  async import(
    input: string | Buffer,
    config: ImporterConfig = {}
  ): Promise<T3XFile> {
    const data: ChatGPTExport[] =
      typeof input === 'string' ? JSON.parse(input) : JSON.parse(input.toString());

    if (!this.canImport(data)) {
      throw new Error('Invalid ChatGPT export format');
    }

    const conversations: Conversation[] = [];

    for (const conv of data) {
      const messages = this.extractMessages(conv.mapping);

      if (messages.length > 0) {
        conversations.push({
          id: uuidv4(),
          title: conv.title || 'Untitled',
          created: new Date(conv.create_time * 1000).toISOString(),
          source: 'chatgpt',
          messages,
          tags: [...(config.tags || []), 'chatgpt', 'imported'],
        });
      }
    }

    return {
      t3x_version: '1.0',
      $schema: 'https://t3x.dev/schema/v1.0.json',
      metadata: {
        id: uuidv4(),
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        name: 'ChatGPT Import',
        description: `Imported ${conversations.length} conversations from ChatGPT`,
        tags: ['chatgpt', 'imported'],
      },
      conversations,
    };
  }

  private extractMessages(mapping: ChatGPTExport['mapping']): Message[] {
    const messages: Message[] = [];

    for (const [msgId, msgObj] of Object.entries(mapping)) {
      if (msgObj.message) {
        const msg = msgObj.message;
        const role = msg.author?.role;

        if (['user', 'assistant'].includes(role)) {
          const content = (msg.content?.parts || []).join('');

          if (content.trim()) {
            messages.push({
              role: role as 'user' | 'assistant',
              content,
              timestamp: new Date(msg.create_time * 1000).toISOString(),
            });
          }
        }
      }
    }

    return messages.sort((a, b) =>
      (a.timestamp || '').localeCompare(b.timestamp || '')
    );
  }
}
