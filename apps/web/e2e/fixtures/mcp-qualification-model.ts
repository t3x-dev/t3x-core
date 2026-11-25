import { createServer } from 'node:http';

export const quotation = 'Traceable Source title';
export const original = `Use this exact product title: ${quotation}.`;
export const extractionQuote = 'Fixture Lantern';
export const extractionTurn = `Name the device ${extractionQuote}.`;

interface ModelPrompt {
  sources: Array<{ sourceIndex: number; content: string }>;
}

function extractionDraft(prompt: string) {
  if (!prompt.includes(extractionTurn)) throw new Error('Missing selected extraction turn.');
  return {
    schema: 't3x/provider-extraction-draft',
    version: 1,
    mode: 'bootstrap',
    items: [
      {
        id: 'device',
        intent: 'add',
        confidence: 0.9,
        reasoning_type: 'direct',
        target_ref: { node_key: null, path: null, existing_node_id: null },
        candidate: {
          key: 'device',
          path_hint: 'device',
          slot: null,
          value_json: null,
          values_json: JSON.stringify({ name: extractionQuote }),
          children_json: null,
        },
        evidence: [{ turn_tag: 'T1', quote: extractionQuote, role: 'primary' }],
      },
    ],
    warnings: [],
  };
}

function governedDraft(input: string) {
  const prompt = JSON.parse(input) as ModelPrompt;
  const source = prompt.sources.find(({ content }) => content === original);
  if (!source) throw new Error('The actual Wire prompt omitted the selected original turn.');
  const pointer = {
    sourceIndex: source.sourceIndex,
    locator: { scheme: 't3x.text-quote/v1', value: { quote: quotation, occurrence: 0 } },
  };
  return {
    schema: 't3x.dev/proposal-generation-draft/v1',
    version: 1,
    posture: 'guided',
    intent: { mode: 'stated', value: quotation, evidencePointers: [pointer] },
    rationale: { mode: 'unspecified' },
    changes: [
      {
        id: 'source-title',
        operations: [{ set: { path: 'prd/title', value: quotation } }],
        claimedOrigin: 'source_backed',
        evidencePointers: [pointer],
        basisPointers: [],
        assumptions: [],
        reason: 'The original user turn supplies the title verbatim.',
        challenges: [],
      },
    ],
    warnings: [],
  };
}

export async function localModel(port: number) {
  let calls = 0;
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404).end();
      return;
    }
    if (request.headers.authorization !== 'Bearer t3x-local-fixture-only') {
      response.writeHead(401).end();
      return;
    }
    calls++;
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const prompt = body.messages.findLast(
        ({ role }: { role: string }) => role === 'user'
      ).content;
      const literals = body.response_format?.json_schema?.schema?.properties?.schema?.enum;
      const draft = literals?.includes('t3x/provider-extraction-draft')
        ? extractionDraft(prompt)
        : governedDraft(prompt);
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(draft) } }],
          usage: { prompt_tokens: 12, completion_tokens: 10 },
        })
      );
    } catch {
      response
        .writeHead(400, { 'Content-Type': 'application/json' })
        .end('{"error":"Invalid local model fixture prompt"}');
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
  return {
    calls: () => calls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
