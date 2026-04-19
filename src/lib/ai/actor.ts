import { Output, streamText, type LanguageModel } from "ai";

import { actorOutputSchema, type GaboUIMessage } from "$lib/ai/schema";
import type { Beat, CharacterRole, Play } from "$lib/screenplay/screenplay";

export interface ActorAgentContext {
  actions: Beat['actions'];
  dialogue: string;
  interlocutors: CharacterRole[];
  language: string;
  model: LanguageModel;
  role: CharacterRole;
  slugline: string;
}

export async function runActorAgent({ actions, dialogue, interlocutors, language, model, role, slugline }: ActorAgentContext) {
  return streamText({
    model,
    messages: [
      {
        role: 'system',
        content: `
          You are playing the following role in a screenplay: ${role.description}.
          
          CONTEXT:
          - Language: ${language}
          - Scene slugline: ${slugline}
          - Interlocutors: ${interlocutors.map(({ name, description, gender }) => `${name} (${description}, gender: ${gender})`).join(', ')}

          YOUR RULES:
          1. Use the <dialogue-history> provided in the user message to maintain continuity.
          2. Improvise the next line of dialogue based on the <actions> provided.
          3. Match the tone and emotional flow of the existing conversation.
          4. Do not repeat greetings, introductions, or information already established in the <dialogue-history>.
          5. Always acknowledge the other character's statement or answer their question naturally before moving on to the instructions in the <actions> block. 
          6. Do not jump straight to the <actions> if the previous line requires a reaction.
          7. Maintain the progression of the scene so that every line moves the interaction forward.
          8. Output ONLY the dialogue text. 
          9. Do NOT include your character's name, parentheticals (like "(angrily)"), or stage directions.
          10. Pay close attention to gender-specific language (pronouns, terms of address like 'Monsieur'/'Madame', and grammatical agreement) based on your gender (${role.gender}) and the gender of your interlocutors.

          You are now in character.`
      },
      {
        role: 'user',
        content: `
          <dialogue-history>
            ${dialogue}
          </dialogue-history>

          <actions>
            ${actions.length > 0 ? actions.join(', ') : 'Respond naturally to the last speaker and continue the scene.'}
          </actions>

          ${role.name}:`
      }
    ],
    output: Output.object({ schema: actorOutputSchema })
  });

}

export function convertToDialogue(messages: Array<GaboUIMessage>, play: Play) {
  return messages
    .filter(({ role, metadata }) => role === "user" || metadata?.agent === "actor")
    .filter(({ parts }) => parts.some((part) => part.type === "text"))
    .map(({ parts, metadata }) => {
      const textPart = parts.find((part) => part.type === "text")!;
      const character = play.getCharacterAtPosition(metadata!.position);
      return { text: textPart.text, character };
    })
    .map(({ text, character }) => `${character.role.name}: ${text}`)
    .join('\n');
}
