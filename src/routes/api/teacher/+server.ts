import { createOpenAI } from "@ai-sdk/openai";

import { OPENAI_API_KEY, MODEL } from '$env/static/private';
import { runTeacherAgent } from "$lib/ai/teacher";
import type { TeacherAgentContext } from "$lib/ai/teacher";

const openai = createOpenAI({ apiKey: OPENAI_API_KEY });
const model = openai(MODEL);

export async function POST({ request }) {
  const { language, slugline, actions, input } = await request.json() as TeacherAgentContext;

  const result = await runTeacherAgent({
    model,
    language,
    slugline,
    actions,
    dialog: [],
    input
  });

  return result.toTextStreamResponse();
}
