import { json } from '@sveltejs/kit';
import { traceStore } from '$lib/server/traceStore';
import { traceActionSchema } from '$lib/trace/types';

export async function GET({ url }) {
  const sessionId = url.searchParams.get('sessionId');

  if (sessionId) {
    const trace = traceStore.getSession(sessionId);
    if (!trace) {
      return json({ error: `Session trace not found for ID: ${sessionId}` }, { status: 404 });
    }
    return json(trace);
  }

  const sessions = traceStore.listSessions();
  return json({ sessions });
}

export async function POST({ request }) {
  const rawBody = await request.json();
  const parsed = traceActionSchema.safeParse(rawBody);

  if (!parsed.success) {
    return json({ error: 'Invalid trace action payload', issues: parsed.error.issues }, { status: 400 });
  }

  const payload = parsed.data;

  switch (payload.action) {
    case 'start': {
      const trace = traceStore.startSession(
        payload.scenario,
        payload.initialState,
        payload.sessionId,
        payload.autoPersist
      );
      return json({ success: true, trace });
    }

    case 'persist': {
      const success = traceStore.persistSessionById(payload.sessionId);
      if (!success) {
        return json({ error: `Session not found: ${payload.sessionId}` }, { status: 404 });
      }
      return json({ success: true, persisted: true });
    }

    case 'reduce': {
      traceStore.recordReducedState(payload.sessionId, payload.turnIndex, payload.state);
      return json({ success: true });
    }

    case 'finish': {
      const trace = traceStore.finishSession(payload.sessionId, payload.status, payload.finalState);
      return json({ success: true, trace });
    }

    case 'event': {
      traceStore.recordEvent(payload.sessionId, payload.turnIndex, payload.event);
      return json({ success: true });
    }
  }
}
