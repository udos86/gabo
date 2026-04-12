import { createOpenAI } from "@ai-sdk/openai";

import { OPENAI_API_KEY, MODEL } from '$env/static/private';
import { runActorAgent, type ActorAgentContext } from "$lib/ai/actor.js";
import { runTeacherAgent, type TeacherAgentContext } from "$lib/ai/teacher";
import { Output, simulateReadableStream, streamText } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { actorOutputSchema, teacherOutputSchema } from "$lib/ai/schema.js";

const openai = createOpenAI({ apiKey: OPENAI_API_KEY });
const model = openai(MODEL);

export async function POST({ request }: { request: Request }) {
  const body = await request.json()
  let result;
  switch (body.agent) {
    case "actor": {
      const { language, slugline, role, actions, dialogue } = body as ActorAgentContext;
      result = await runActorAgent({ model, language, slugline, role, actions, dialogue });
      /*
      await new Promise<void>(resolve => setTimeout(() => resolve(), 3000));
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
      });
      */
      break;
    }
    case "teacher": {
      /*
      const { language, slugline, actions, input } = body as TeacherAgentContext;
      result = await runTeacherAgent({ model, language, slugline, actions, dialog: [], input });
      */
      await new Promise<void>(resolve => setTimeout(() => resolve(), 3000));
      result = streamText({
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
                { type: 'text-delta', id: 'text-1', delta: `"C'est parfait.` },
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
      });
      break;
    }
  }

  if (result === undefined) return new Response("Invalid agent type", { status: 400 });
  return result.toTextStreamResponse();
}
