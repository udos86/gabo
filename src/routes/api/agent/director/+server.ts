import { toTextStream } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

import { OPENAI_API_KEY, DIRECTOR_MODEL } from '$env/static/private';
import { runDirectorAgent, type DirectorAgentContext } from '$lib/ai/director';

const openai = createOpenAI({ apiKey: OPENAI_API_KEY });

export async function POST({ request }: { request: Request }) {
  const body = (await request.json()) as DirectorAgentContext;

  const model = openai(DIRECTOR_MODEL);
  const result = await runDirectorAgent({ ...body, model });

  return toTextStream({ stream: result.stream });
}
