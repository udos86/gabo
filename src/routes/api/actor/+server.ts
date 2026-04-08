import { createOpenAI } from "@ai-sdk/openai";

import { OPENAI_API_KEY, MODEL } from '$env/static/private';
import { runActorAgent, type ActorAgentContext } from "$lib/ai/actor.js";

const openai = createOpenAI({ apiKey: OPENAI_API_KEY });
const model = openai(MODEL);

export async function POST({ request }) {
  const { language, slugline, role, actions } = await request.json() as ActorAgentContext;

  const result = await runActorAgent({
    model,
    language,
    slugline,
    role,
    actions,
    dialog: []
  });

  return result.toTextStreamResponse();
}
