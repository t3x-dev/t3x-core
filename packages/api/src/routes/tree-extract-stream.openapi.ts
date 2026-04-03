import { OpenAPIHono } from '@hono/zod-openapi';
import { zodErrorHook } from '../lib/errors';
import { runExtractionPipeline } from '../lib/extraction-pipeline';
import { assertProjectAccess } from '../lib/project-access';
import { getUserId } from '../lib/usage-tracking';
import { getDB } from '../lib/db';
import { findConversationById } from '@t3x-dev/storage';

// Named SSE events: `event: type\ndata: ...\n\n`
// Intentionally differs from chat endpoint's flat `data: {type: ...}` format.
// The extraction client parser handles this format specifically.
function encodeSseEvent(event: string, payload: string): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${payload}\n\n`);
}

export const treeExtractStreamRoutes = new OpenAPIHono({ defaultHook: zodErrorHook });

treeExtractStreamRoutes.post('/v1/extract/trees/stream', async (c) => {
  const body = await c.req.json();
  const { conversation_id, turn_hashes, drift_decision, topic_id, force_extract } = body;

  // Validate conversation + project access
  const db = await getDB();
  const conversation = await findConversationById(db, conversation_id);
  if (!conversation) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } },
      404
    );
  }
  const accessResult = await assertProjectAccess(c, db, conversation.projectId);
  if (accessResult instanceof Response) return accessResult;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const pipeline = runExtractionPipeline({
          conversationId: conversation_id,
          projectId: conversation.projectId,
          turnHashes: turn_hashes,
          driftDecision: drift_decision,
          topicId: topic_id,
          forceExtract: force_extract,
          userId: getUserId(c) ?? undefined,
        });

        for await (const event of pipeline) {
          controller.enqueue(encodeSseEvent(event.type, JSON.stringify(event.data)));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        controller.enqueue(encodeSseEvent('error', JSON.stringify({ message })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});
