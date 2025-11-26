import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ConversationTurn, Role /* , Speaker */ } from './types';
import { ensureDir, pathExists } from '../utils/fs';

export interface AppendTurnInput {
  role: Role;
  text: string;
  // speaker: Speaker;
  timestamp?: string;
}

const TURN_ID_PREFIX = 'turn-';

export class ConversationStore {
  private readonly conversationDir: string;
  private readonly conversationFile: string;
  private initialized = false;

  constructor(contextflowDir: string, project: string) {
    this.conversationDir = path.join(contextflowDir, 'conversations', project);
    this.conversationFile = path.join(this.conversationDir, 'conversation.jsonl');
  }

  get filePath(): string {
    return this.conversationFile;
  }

  async appendTurn(input: AppendTurnInput): Promise<ConversationTurn> {
    await this.initialize();

    const turn: ConversationTurn = {
      id: `${TURN_ID_PREFIX}${randomUUID()}`,
      role: input.role,
      // speaker: input.speaker,
      text: input.text,
      timestamp: input.timestamp ?? new Date().toISOString(),
    };

    const serialized = JSON.stringify(turn);
    await fs.appendFile(this.conversationFile, `${serialized}\n`, 'utf-8');
    return turn;
  }

  async loadTurns(): Promise<ConversationTurn[]> {
    await this.initialize();

    if (!(await pathExists(this.conversationFile))) {
      return [];
    }

    const content = await fs.readFile(this.conversationFile, 'utf-8');
    const turns: ConversationTurn[] = [];
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        const parsed = JSON.parse(trimmed) as ConversationTurn;
        turns.push(parsed);
      } catch (error) {
        console.warn('Failed to parse conversation line', error);
      }
    }
    return turns;
  }

  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await ensureDir(this.conversationDir);
    this.initialized = true;
  }
}
