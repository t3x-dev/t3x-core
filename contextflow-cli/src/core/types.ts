export interface UserConfig {
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  defaultModel?: string;
  proxyUrl?: string;
}

export interface ResolvedConfig {
  apiKey: string;
  model: string;
}

export type Role = 'user' | 'assistant' | 'system';

// export type Speaker = 'human' | 'model';

export interface ConversationTurn {
  id: string;
  role: Role;
  // speaker: Speaker;
  text: string;
  timestamp: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  project: string;
  model: string;
  stream: boolean;
  systemPrompt?: string;
}
