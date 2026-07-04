import { createOpenAI } from "@ai-sdk/openai";

import { OPENAI_API_KEY, ACTOR_MODEL } from '$env/static/private';
import { runActorAgent } from "$lib/ai/actor.js";
import type { ActorAgentContext } from "$lib/ai/schema.js";

const openai = createOpenAI({ apiKey: OPENAI_API_KEY });

export async function POST({ request }: { request: Request }) {

  const model = openai(ACTOR_MODEL);
  const body = await request.json();
  const { actions, characterIds, dialogue, goal, interlocutors, language, milestones, role, slugline, turnsRemaining } = body as ActorAgentContext;
  const result = await runActorAgent({ actions, characterIds, dialogue, goal, interlocutors, language, milestones, model, role, slugline, turnsRemaining });

  /*
  await new Promise<void>(resolve => setTimeout(() => resolve(), 2000));

  const result = streamText({
    model: new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start', id: 'text-1' },
            { type: 'text-delta', id: 'text-1', delta: '{ ' },
            { type: 'text-delta', id: 'text-1', delta: '"agent": ' },
            { type: 'text-delta', id: 'text-1', delta: '"actor",' },
            { type: 'text-delta', id: 'text-1', delta: '"text": ' },
            { type: 'text-delta', id: 'text-1', delta: `"Bonjour, ` },
            { type: 'text-delta', id: 'text-1', delta: `monsieur` },
            { type: 'text-delta', id: 'text-1', delta: `! ` },
            { type: 'text-delta', id: 'text-1', delta: `Bienvenue ` },
            { type: 'text-delta', id: 'text-1', delta: `dans notre ` },
            { type: 'text-delta', id: 'text-1', delta: `petit ` },
            { type: 'text-delta', id: 'text-1', delta: `café."` },
            { type: 'text-delta', id: 'text-1', delta: ',' },
            { type: 'text-delta', id: 'text-1', delta: '"nextBeat": {' },
            { type: 'text-delta', id: 'text-1', delta: '"character": "0815",' },
            { type: 'text-delta', id: 'text-1', delta: '"actions": ["greet the waiter back", "ask for a table"],' },
            { type: 'text-delta', id: 'text-1', delta: '"milestone": null,' },
            { type: 'text-delta', id: 'text-1', delta: '"completed": false' },
            { type: 'text-delta', id: 'text-1', delta: '}' },
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
    output: Output.object({ schema: actorOutputSchema }),
    prompt: [{ role: 'assistant', content: '' }]
  }) as unknown as Awaited<ReturnType<typeof runActorAgent>>;
  */

  if (result === undefined) return new Response("Invalid agent type", { status: 400 });

  return result.toTextStreamResponse();
  // return createTextStreamResponse({ textStream: result.textStream });
}
