import { ChatMessage } from '../core/types';

interface CreateChatCompletionArgs {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  stream: boolean;
  onToken?: (token: string) => void;
}

const CLAUDE_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_VERSION = '2023-06-01';
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

interface ClaudeMessageResponse {
  content?: { type: string; text?: string }[];
}

interface ClaudeStreamEvent {
  event?: string;
  data?: {
    delta?: { text?: string; type?: string };
    error?: { message?: string };
  };
}

type ClaudeChatMessage = {
  role: 'user' | 'assistant';
  content: Array<{ type: 'text'; text: string }>;
};

export async function createChatCompletion({
  apiKey,
  model,
  messages,
  stream,
  onToken,
}: CreateChatCompletionArgs): Promise<string> {
  const payload = buildClaudePayload(messages, model, stream);
  const response = await fetch(CLAUDE_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': CLAUDE_VERSION,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await safeReadError(response);
    throw new Error(
      `Claude API request failed (${response.status} ${response.statusText}): ${errorText}`,
    );
  }

  if (!stream) {
    const json = (await response.json()) as ClaudeMessageResponse;
    const content = extractTextContent(json);
    if (!content) {
      throw new Error('Claude API returned an empty response.');
    }
    return content;
  }

  if (!response.body) {
    throw new Error('Claude API streaming response did not include a body.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let accumulated = '';
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    buffer = await processClaudeStream(buffer, (delta) => {
      accumulated += delta;
      if (onToken) {
        onToken(delta);
      }
    });
  }

  if (buffer.length > 0) {
    await processClaudeStream(`${buffer}\n\n`, (delta) => {
      accumulated += delta;
      if (onToken) {
        onToken(delta);
      }
    });
  }

  return accumulated;
}

function buildClaudePayload(messages: ChatMessage[], model: string, stream: boolean): {
  model: string;
  max_tokens: number;
  stream: boolean;
  messages: ClaudeChatMessage[];
  system?: string;
} {
  const systemMessages: string[] = [];
  const conversation: ClaudeChatMessage[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      systemMessages.push(message.content);
      continue;
    }
    if (isClaudeRole(message.role)) {
      conversation.push({
        role: message.role,
        content: [{ type: 'text', text: message.content }],
      });
    }
  }

  const payload: {
    model: string;
    max_tokens: number;
    stream: boolean;
    messages: ClaudeChatMessage[];
    system?: string;
  } = {
    model,
    max_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
    stream,
    messages: conversation,
  };

  if (systemMessages.length > 0) {
    payload.system = systemMessages.join('\n\n');
  }

  return payload;
}

function isClaudeRole(role: ChatMessage['role']): role is 'user' | 'assistant' {
  return role === 'user' || role === 'assistant';
}

function extractTextContent(response: ClaudeMessageResponse): string {
  const content = response.content ?? [];
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text ?? '')
    .join('');
}

async function safeReadError(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text ? text.slice(0, 400) : 'No additional error details.';
  } catch {
    return 'Failed to read error response.';
  }
}

async function processClaudeStream(
  buffer: string,
  onDelta: (delta: string) => void,
): Promise<string> {
  let working = buffer;
  let separatorIndex = working.indexOf('\n\n');

  while (separatorIndex !== -1) {
    const chunk = working.slice(0, separatorIndex);
    working = working.slice(separatorIndex + 2);

    const event = parseClaudeStreamChunk(chunk);
    if (!event) {
      separatorIndex = working.indexOf('\n\n');
      continue;
    }

    if (event.event === 'content_block_delta') {
      const deltaText = event.data?.delta?.text;
      if (deltaText) {
        onDelta(deltaText);
      }
    } else if (event.event === 'message_delta') {
      const deltaText = event.data?.delta?.text;
      if (deltaText) {
        onDelta(deltaText);
      }
    } else if (event.event === 'error') {
      const message = event.data?.error?.message ?? 'Claude streaming request failed.';
      throw new Error(message);
    }

    separatorIndex = working.indexOf('\n\n');
  }

  return working;
}

function parseClaudeStreamChunk(chunk: string): ClaudeStreamEvent | undefined {
  const lines = chunk.split('\n');
  let eventName: string | undefined;
  const dataLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }

  if (dataLines.length === 0) {
    return undefined;
  }

  try {
    const payload = JSON.parse(dataLines.join('')) as ClaudeStreamEvent['data'];
    return { event: eventName, data: payload };
  } catch (error) {
    console.error('Failed to parse Claude stream payload', error);
    return undefined;
  }
}
