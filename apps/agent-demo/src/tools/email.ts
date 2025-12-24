import { appendFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTBOX_PATH = join(__dirname, '../../outbox.jsonl');

export interface EmailArgs {
  to: string;
  subject: string;
  body: string;
}

export interface EmailResult {
  message_id: string;
  ok: true;
}

/**
 * Mock email.send tool
 *
 * Instead of sending real email, writes to outbox.jsonl
 * This makes the agent deterministic and assertable
 */
export function sendEmail(args: EmailArgs): EmailResult {
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const record = {
    message_id: messageId,
    timestamp: new Date().toISOString(),
    to: args.to,
    subject: args.subject,
    body: args.body,
  };

  // Ensure directory exists
  mkdirSync(dirname(OUTBOX_PATH), { recursive: true });

  // Append to outbox
  appendFileSync(OUTBOX_PATH, JSON.stringify(record) + '\n');

  return {
    message_id: messageId,
    ok: true,
  };
}
