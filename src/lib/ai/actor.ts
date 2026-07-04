import { Output, streamText } from "ai";

import { actorOutputSchema, type ActorAgentContext, type GaboUIMessage } from "$lib/ai/schema";
import type { Play } from "$lib/screenplay/screenplay";

export async function runActorAgent({ actions, characterIds, dialogue, goal, interlocutors, language, milestones, model, role, slugline, turnsRemaining }: ActorAgentContext) {
  const milestonesContext = milestones
    .map(m => `- [${m.reached ? 'x' : ' '}] ${m.id}: ${m.description}`)
    .join('\n');

  const characterIdList = Object.entries(characterIds)
    .map(([id, name]) => `${id} = ${name}`)
    .join(', ');

  return streamText({
    model,
    messages: [
      {
        role: 'system',
        content: `
          You are playing the following role in a screenplay AND directing the scene: ${role.description}.
          
          CONTEXT:
          - Language: ${language}
          - Scene slugline: ${slugline}
          - Interlocutors: ${interlocutors.map(({ name, description, gender }) => `${name} (${description}, gender: ${gender})`).join(', ')}
          - Lesson goal: ${goal}
          - Milestones (in order):
            ${milestonesContext}
          - Turns remaining: ${turnsRemaining}
          - Character IDs: ${characterIdList}

          YOUR RULES (PERFORMING):
          1. Use the <dialogue-history> provided in the user message to maintain continuity.
          2. Improvise the next line of dialogue based on the <actions> provided.
          3. Match the tone and emotional flow of the existing conversation.
          4. Do not repeat greetings, introductions, or information already established in the <dialogue-history>.
          5. Always acknowledge the other character's statement or answer their question naturally before moving on to the instructions in the <actions> block. 
          6. Do not jump straight to the <actions> if the previous line requires a reaction.
          7. Maintain the progression of the scene so that every line moves the interaction forward.
          8. Output ONLY the dialogue text in the "text" field. 
          9. Do NOT include your character's name, parentheticals (like "(angrily)"), or stage directions in the "text" field.
          10. Pay close attention to gender-specific language (pronouns, terms of address like 'Monsieur'/'Madame', and grammatical agreement) based on your gender (${role.gender}) and the gender of your interlocutors.

          YOUR RULES (DIRECTING):
          11. After delivering your line, decide what should happen NEXT in the scene by outputting a "nextBeat" object.
          12. The "nextBeat" must specify the character ID of the next speaker and what actions they should perform.
          13. Steer the conversation toward the current unreached milestone.
          14. Between milestones, improvise naturally: make small talk, introduce light complications (item unavailable, mishearing, suggesting alternatives), or ask unexpected but realistic questions.
          15. When turnsRemaining is low (5 or fewer), reduce improvisation and steer directly toward uncompleted milestones.
          16. When all milestones are reached and the goal is fulfilled, set "completed" to true and deliver a natural closing line.
          17. NEVER repeat the same complication or conversational tangent twice in a single lesson.
          18. Keep complications grounded and realistic — no dramatic plot twists.
          19. If the next speaker's milestone is reached by the current exchange, set the "milestone" field to that milestone's ID.
          20. Use the character IDs listed above (not character names) in the "nextBeat.character" field.

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
      const character = play.getCharacterById(metadata!.characterId);
      return { text: textPart.text, character };
    })
    .map(({ text, character }) => `${character.role.name}: ${text}`)
    .join('\n');
}
