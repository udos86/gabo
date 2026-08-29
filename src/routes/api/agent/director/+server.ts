import { createTextStreamResponse, toTextStream } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

import { OPENAI_API_KEY, DIRECTOR_MODEL } from '$env/static/private';
import { runDirectorAgent, type DirectorAgentInput } from '$lib/ai/director';
import { traceStore, attachStreamTrace } from '$lib/server/traceStore';
import type { WithTraceMeta } from '$lib/trace/types';
import type { DirectorOutput } from '$lib/scenario/state';

const openai = createOpenAI({ apiKey: OPENAI_API_KEY });

export async function POST({ request }: { request: Request }) {
  const body = (await request.json()) as WithTraceMeta<DirectorAgentInput>;
  const startTime = Date.now();

  const model = openai(DIRECTOR_MODEL);
  const result = await runDirectorAgent({ ...body, model });

  if (body.sessionId) {
    const turnIndex = body.turnIndex ?? body.turn ?? 1;

    attachStreamTrace<DirectorAgentInput, DirectorOutput>({
      sessionId: body.sessionId,
      turnIndex,
      startTime,
      model: DIRECTOR_MODEL,
      systemPrompt: result.prompts.systemPrompt,
      prompt: result.prompts.userPrompt,
      input: body,
      result,
      errorLabel: 'Director',
      onRecorded: (call) => {
        traceStore.recordDirectorCall(body.sessionId!, turnIndex, call, {
          studentInput: body.studentInput,
          dialogueHistorySnapshot: body.dialogue
        });
      }
    });
  }

  return createTextStreamResponse({
    stream: toTextStream({ stream: result.stream })
  });
}
