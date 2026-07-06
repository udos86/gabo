import { Output, streamText } from "ai";

import { actorOutputSchema, type ActorAgentContext, type GaboUIMessage } from "$lib/ai/schema";

export async function runActorAgent({ actions, dialogue, interlocutors, language, model, role, slugline, worldFacts = {}, variables = {} }: ActorAgentContext) {
  const hasWorldFacts = Object.keys(worldFacts).length > 0;
  const hasVariables = Object.keys(variables).length > 0;

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
          ${hasVariables ? `- Scene colour (reflect this in tone, do not state it explicitly): ${JSON.stringify(variables)}` : ''}
          ${hasWorldFacts ? `- Established world facts (already true — NEVER contradict or repeat as if new): ${JSON.stringify(worldFacts)}` : ''}

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
          11. Never contradict an established world fact, and never perform or announce an action that a world fact says already happened.

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

export function convertToDialogue(messages: Array<GaboUIMessage>, characters: Record<string, { role: { name: string } }>) {
  return messages
    .filter(({ role, metadata }) => role === "user" || metadata?.agent === "actor")
    .filter(({ metadata }) => metadata.status === 'done')
    .filter(({ parts }) => parts.some((part) => part.type === "text"))
    .map(({ parts, metadata }) => {
      const textPart = parts.find((part) => part.type === "text")!;
      const character = characters[metadata!.characterId];
      const name = character?.role.name ?? metadata!.characterId;
      return `${name}: ${textPart.text}`;
    })
    .join('\n');
}
