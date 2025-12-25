import { join } from 'path';

const DEFAULT_OUTBOX_FILENAME = 'outbox.jsonl';

export function getOutboxPath(): string {
  const outboxPath = process.env.AGENT_DEMO_OUTBOX_PATH?.trim();
  if (outboxPath) {
    return outboxPath;
  }

  const outboxDir = process.env.AGENT_DEMO_OUTBOX_DIR?.trim();
  if (outboxDir) {
    return join(outboxDir, DEFAULT_OUTBOX_FILENAME);
  }

  return join(process.cwd(), DEFAULT_OUTBOX_FILENAME);
}
