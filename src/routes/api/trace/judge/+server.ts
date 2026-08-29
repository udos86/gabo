import { json } from '@sveltejs/kit';
import { traceStore } from '$lib/server/traceStore';
import { evaluateSession } from '$lib/server/judge';
import type { SessionTrace } from '$lib/trace/types';

export async function POST({ request }) {
  try {
    const body = (await request.json()) as { sessionId?: string; trace?: SessionTrace };
    let trace = body.trace;

    if (!trace && body.sessionId) {
      trace = traceStore.getSession(body.sessionId);
    }

    if (!trace) {
      return json({ error: body.sessionId ? `Session ${body.sessionId} not found` : 'Missing sessionId or trace' }, { status: 404 });
    }

    const report = await evaluateSession(trace);
    return json({ success: true, report });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Judge evaluation failed:', err);
    return json({ error: message }, { status: 500 });
  }
}
