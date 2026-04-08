import { convertToModelMessages, streamText, type LanguageModel } from "ai";

import type { Beat } from "$lib/screenplay/screenplay";

export interface ActorAgentContext {
  model: LanguageModel;
  language: string;
  slugline: string;
  role: string;
  actions: Beat['actions'];
  dialog: string[];
}

export async function runActorAgent({ model, language, slugline, role, actions, dialog }: ActorAgentContext) {
  return streamText({
    model,
    messages: await convertToModelMessages([{
      role: 'system',
      parts: [{
        type: 'text',
        text: `
          You are an improvise actor agent.
          You will improvise a dialog based on a given scene, role and set of actions in ${language}.
          Do consider the dialog that has already taken place and do not repeat yourself.
          Return the improvised text as a string.
          The scene slugline is: ${slugline}
          The role you play is: ${role}
          The actions you take are: ${actions.join(', ')}
          The dialog so far is: ${dialog.join(' ')}
        `
      }]
    }]),
    /*
    output: Output.object({
      schema: z.object({
        text: z.string()
      })
    })
    */
  });
}
