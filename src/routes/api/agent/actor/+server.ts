import { createOpenAI } from "@ai-sdk/openai";

import { OPENAI_API_KEY, ACTOR_MODEL, MOCK_LLM } from '$env/static/private';
import { runActorAgent } from "$lib/ai/actor.js";
import { Output, simulateReadableStream, streamText } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { actorOutputSchema, type ActorAgentContext } from "$lib/ai/schema.js";

const openai = createOpenAI({ apiKey: OPENAI_API_KEY });

export async function POST({ request }: { request: Request }) {
  let result: Awaited<ReturnType<typeof runActorAgent>> | undefined;

  if (MOCK_LLM === 'true') {
    await new Promise<void>(resolve => setTimeout(() => resolve(), 2000));

    result = streamText({
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
              { type: 'text-delta', id: 'text-1', delta: `café. ` },
              { type: 'text-delta', id: 'text-1', delta: `Les couleurs ` },
              { type: 'text-delta', id: 'text-1', delta: `de l'automne ` },
              { type: 'text-delta', id: 'text-1', delta: `sont ` },
              { type: 'text-delta', id: 'text-1', delta: `magnifiques ` },
              { type: 'text-delta', id: 'text-1', delta: `sur les ` },
              { type: 'text-delta', id: 'text-1', delta: `boulevards ` },
              { type: 'text-delta', id: 'text-1', delta: `aujourd'hui. ` },
              { type: 'text-delta', id: 'text-1', delta: `S'il vous plaît, ` },
              { type: 'text-delta', id: 'text-1', delta: `entrez ` },
              { type: 'text-delta', id: 'text-1', delta: `pour vous ` },
              { type: 'text-delta', id: 'text-1', delta: `mettre ` },
              { type: 'text-delta', id: 'text-1', delta: `à l'abri ` },
              { type: 'text-delta', id: 'text-1', delta: `du vent ` },
              { type: 'text-delta', id: 'text-1', delta: `frais. ` },
              { type: 'text-delta', id: 'text-1', delta: `Puis-je ` },
              { type: 'text-delta', id: 'text-1', delta: `vous apporter ` },
              { type: 'text-delta', id: 'text-1', delta: `un café ` },
              { type: 'text-delta', id: 'text-1', delta: `au lait ` },
              { type: 'text-delta', id: 'text-1', delta: `bien chaud ?` },
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
      output: Output.object({ schema: actorOutputSchema }),
      prompt: [{ role: 'assistant', content: '' }]
    }) as unknown as Awaited<ReturnType<typeof runActorAgent>>;

  } else {

    const model = openai(ACTOR_MODEL);
    const body = await request.json();
    const { dialogue, interlocutors, language, role, slugline, stageDirections, variables, worldFacts } = body as ActorAgentContext;
    result = await runActorAgent({ dialogue, interlocutors, language, model, role, slugline, stageDirections, variables, worldFacts });
  }

  if (result === undefined) return new Response("Invalid agent type", { status: 400 });

  return result.toTextStreamResponse();
  // return createTextStreamResponse({ textStream: result.textStream });
}
