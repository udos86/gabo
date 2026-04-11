import { Output, streamText, type LanguageModel } from "ai";

import { actorOutputSchema, type GaboUIMessage } from "$lib/ai/schema";
import type { Beat, Play } from "$lib/screenplay/screenplay";

export interface ActorAgentContext {
  model: LanguageModel;
  language: string;
  slugline: string;
  role: string;
  actions: Beat['actions'];
  dialogue: string;
}

export async function runActorAgent({ model, language, slugline, role, actions, dialogue }: ActorAgentContext) {
  return streamText({
    model,
    messages: [
      {
        role: 'system',
        content: `
          You are playing the role of ${role} in a screenplay. 

          CONTEXT:
          - Language: ${language}
          - Scene slugline: ${slugline}

          YOUR RULES:
          1. Use the <dialogue-history> provided in the user message to maintain continuity.
          2. Improvise the next line of dialogue based on the <actions> provided.
          3. Match the tone and emotional flow of the existing conversation.
          4. Output ONLY the dialogue text. 
          5. Do NOT include your character's name, parentheticals (like "(angrily)"), or stage directions.

          You are now in character.
        `
      },
      {
        role: 'user',
        content: `
          <dialogue-history>
            ${dialogue}
          </dialogue-history>

          <actions>
            ${actions.join(', ')}
          </actions>

          ${role}:`
      }
    ],
    output: Output.object({ schema: actorOutputSchema })
  });

}

export function convertToDialog(messages: Array<GaboUIMessage>, play: Play) {
  return messages
    .filter(({ role, metadata }) => role === "user" || metadata?.agent === "actor")
    .filter(({ parts }) => parts.some((part) => part.type === "text"))
    .map(({ parts, metadata }) => {
      const textPart = parts.find((part) => part.type === "text")!;
      const character = play.getCharacterAtPosition(metadata!.position);
      return { text: textPart.text, character };
    })
    .map(({ text, character }) => `${character.role}: ${text}`)
    .join('\n');
}
