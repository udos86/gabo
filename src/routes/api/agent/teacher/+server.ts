import { createOpenAI } from "@ai-sdk/openai";

import { OPENAI_API_KEY, TEACHER_MODEL } from '$env/static/private';
import { runTeacherAgent } from "$lib/ai/teacher";
import { Output, simulateReadableStream, streamText } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { teacherOutputSchema, type TeacherAgentContext } from "$lib/ai/schema.js";

const openai = createOpenAI({ apiKey: OPENAI_API_KEY });

export async function POST({ request }: { request: Request }) {
  /*
  const model = openai(TEACHER_MODEL);
  const body = await request.json();
  const { actions, dialogue, input, interlocutors, language, role, slugline } = body as TeacherAgentContext;
  const result = await runTeacherAgent({ actions, dialogue, input, language, model, role, slugline, interlocutors });
  */

  await new Promise<void>(resolve => setTimeout(() => resolve(), 3000));

  const result = streamText({
    model: new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start', id: 'text-1' },
            { type: 'text-delta', id: 'text-1', delta: '{ ' },
            { type: 'text-delta', id: 'text-1', delta: '"agent": ' },
            { type: 'text-delta', id: 'text-1', delta: '"teacher",' },
            { type: 'text-delta', id: 'text-1', delta: '"passed": ' },
            { type: 'text-delta', id: 'text-1', delta: 'true,' },
            { type: 'text-delta', id: 'text-1', delta: '"text": ' },
            { type: 'text-delta', id: 'text-1', delta: `"C'est parfait. ` },
            { type: 'text-delta', id: 'text-1', delta: `C'est parfait. ` },
            { type: 'text-delta', id: 'text-1', delta: `C'est parfait. ` },
            { type: 'text-delta', id: 'text-1', delta: `C'est parfait. ` },
            { type: 'text-delta', id: 'text-1', delta: `C'est parfait. ` },
            { type: 'text-delta', id: 'text-1', delta: `"` },
            { type: 'text-delta', id: 'text-1', delta: ' }' },
            { type: 'text-end', id: 'text-1' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: undefined },
              logprobs: undefined,
              usage: {
                inputTokens: {
                  total: 3,
                  noCache: 3,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: {
                  total: 10,
                  text: 10,
                  reasoning: undefined,
                },
              },
            },
          ],
        }),
      }),
    }),
    output: Output.object({ schema: teacherOutputSchema }),
    prompt: [{ role: 'assistant', content: '' }]
  }) as unknown as Awaited<ReturnType<typeof runTeacherAgent>>;

  if (result === undefined) return new Response("Invalid agent type", { status: 400 });

  return result.toTextStreamResponse();
  // return createTextStreamResponse({ textStream: result.textStream });
}
