import { convertToModelMessages, simulateReadableStream, streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { MockLanguageModelV3 } from "ai/test";

import { OPENAI_API_KEY, MODEL } from '$env/static/private';
import { runActorAgent } from "$lib/ai/actor.js";
import { runTeacherAgent } from "$lib/ai/teacher.js";
import type { GaboUIMessage } from "$lib/ai/schema";

const openai = createOpenAI({ apiKey: OPENAI_API_KEY });
const model = openai(MODEL);

export async function POST({ request }) {
  const { messages }: { messages: GaboUIMessage[] } = await request.json();
  const message = messages.at(-1);

  if (message === undefined) throw new Error('No messages provided in request body.');
  if (message.metadata === undefined) throw new Error('Latest message is missing metadata.');

  const { actions, language, slugline, role } = message.metadata;

  let result;

  if (message.metadata.agent === 'actor') {
    result = await runActorAgent({
      model,
      language,
      slugline,
      role,
      actions,
      dialog: []
    });

  } else if (message.metadata.agent === 'teacher') {
    result = await runTeacherAgent({
      model,
      language,
      slugline,
      actions,
      dialog: [],
      input: message.parts.map(part => part.type === 'text' ? part.text : '').join(' ')
    });

  } else {
    result = streamText({
      model: new MockLanguageModelV3({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: 'text-start', id: 'text-1' },
              { type: 'text-delta', id: 'text-1', delta: 'Hello ' },
              { type: 'text-delta', id: 'text-1', delta: 'from ' },
              { type: 'text-delta', id: 'text-1', delta: 'LLM! ' },
              { type: 'text-delta', id: 'text-1', delta: 'Hello ' },
              { type: 'text-delta', id: 'text-1', delta: 'from ' },
              { type: 'text-delta', id: 'text-1', delta: 'LLM! ' },
              { type: 'text-delta', id: 'text-1', delta: 'Hello ' },
              { type: 'text-delta', id: 'text-1', delta: 'from ' },
              { type: 'text-delta', id: 'text-1', delta: 'LLM! ' },
              { type: 'text-delta', id: 'text-1', delta: 'Hello ' },
              { type: 'text-delta', id: 'text-1', delta: 'from ' },
              { type: 'text-delta', id: 'text-1', delta: 'LLM! ' },
              { type: 'text-delta', id: 'text-1', delta: 'Hello ' },
              { type: 'text-delta', id: 'text-1', delta: 'from ' },
              { type: 'text-delta', id: 'text-1', delta: 'LLM! ' },
              { type: 'text-delta', id: 'text-1', delta: 'Hello ' },
              { type: 'text-delta', id: 'text-1', delta: 'from ' },
              { type: 'text-delta', id: 'text-1', delta: 'LLM! ' },
              { type: 'text-delta', id: 'text-1', delta: 'Hello ' },
              { type: 'text-delta', id: 'text-1', delta: 'from ' },
              { type: 'text-delta', id: 'text-1', delta: 'LLM! ' },
              { type: 'text-delta', id: 'text-1', delta: 'Hello ' },
              { type: 'text-delta', id: 'text-1', delta: 'from ' },
              { type: 'text-delta', id: 'text-1', delta: 'LLM! ' },
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
      prompt: await convertToModelMessages(messages),
    });
  }

  return result.toUIMessageStreamResponse({
    messageMetadata(options) {
      return { role };
    }
  });
}
