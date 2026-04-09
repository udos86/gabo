import { createOpenAI } from "@ai-sdk/openai";

import { OPENAI_API_KEY, MODEL } from '$env/static/private';
import { runActorAgent, type ActorAgentContext } from "$lib/ai/actor.js";
import { runTeacherAgent, type TeacherAgentContext } from "$lib/ai/teacher";

const openai = createOpenAI({ apiKey: OPENAI_API_KEY });
const model = openai(MODEL);

export async function POST({ request }) {
  const body = await request.json()
  let result;
  
  switch (body.agent) {
    case "actor": {
      const { language, slugline, role, actions } = body as ActorAgentContext;
      result = await runActorAgent({ model, language, slugline, role, actions, dialog: [] });
      break;
    }
    case "teacher": {
      const { language, slugline, actions, input } = body as TeacherAgentContext;
      result = await runTeacherAgent({ model, language, slugline, actions, dialog: [], input });
      break;
    }
  }

  if (result === undefined) return new Response("Invalid agent type", { status: 400 });
  return result.toTextStreamResponse();
}
