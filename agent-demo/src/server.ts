import express from 'express';
import { runAgent, type AgentInput } from './agent.js';
import { getOutboxPath } from './outbox.js';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 9000;

/**
 * Health check
 */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'agent-demo' });
});

/**
 * POST /run - Graybox agent contract
 *
 * Receives:
 * {
 *   case_id: string,
 *   input: string,
 *   context: { meeting_notes?, recipient?, ... },
 *   leaf?: { leaf_id, commit_hash, mode }
 * }
 *
 * Returns:
 * {
 *   output: { summary, email? },
 *   trace_events: [...]
 * }
 */
app.post('/run', async (req, res) => {
  const startTime = Date.now();

  try {
    const input = req.body as AgentInput;

    // Validate required fields
    if (!input.case_id || !input.input) {
      return res.status(400).json({
        error: 'Missing required fields: case_id, input',
      });
    }

    console.log(`[${input.case_id}] Running agent...`);

    const result = await runAgent(input);

    console.log(`[${input.case_id}] Completed in ${Date.now() - startTime}ms`);

    res.json(result);
  } catch (error) {
    console.error('Agent error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
      trace_events: [
        {
          type: 'error',
          name: 'agent',
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
      ],
    });
  }
});

/**
 * GET /outbox - View sent emails (for debugging)
 */
app.get('/outbox', async (_req, res) => {
  try {
    const { readFileSync, existsSync } = await import('fs');
    const outboxPath = getOutboxPath();

    if (!existsSync(outboxPath)) {
      return res.json({ emails: [] });
    }

    const content = readFileSync(outboxPath, 'utf-8');
    const emails = content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));

    res.json({ emails });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/**
 * DELETE /outbox - Clear outbox (for test reset)
 */
app.delete('/outbox', async (_req, res) => {
  try {
    const { unlinkSync, existsSync } = await import('fs');
    const outboxPath = getOutboxPath();

    if (existsSync(outboxPath)) {
      unlinkSync(outboxPath);
    }

    res.json({ cleared: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.listen(PORT, () => {
  console.log(`Agent Demo running on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log('  GET  /health  - Health check');
  console.log('  POST /run     - Run agent (graybox contract)');
  console.log('  GET  /outbox  - View sent emails');
  console.log('  DELETE /outbox - Clear outbox');
});

export { app };
