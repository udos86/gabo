import { Output, streamText, type SystemModelMessage, type UserModelMessage } from "ai";

import { actorOutputSchema, type ActorAgentContext, type GaboUIMessage } from "$lib/ai/schema";

export function buildActorMessages({
  dialogue = '',
  interlocutors = [],
  language,
  role,
  slugline,
  stageDirections = [],
  worldFacts = {},
  variables = {}
}: Omit<ActorAgentContext, 'model'>): { systemMessage: SystemModelMessage, userMessage: UserModelMessage & { content: string; } } {
  const hasWorldFacts = Object.keys(worldFacts).length > 0;
  const hasVariables = Object.keys(variables).length > 0;

  const systemPrompt = `
          You are playing the following role in an interactive, didactic language-learning roleplay: ${role.description}.
          Your primary purpose is to help the student practice ${language}. You must balance acting in character with being a patient, pedagogically effective conversational partner.
          
          CONTEXT:
          - Language: ${language}
          - Scene slugline: ${slugline}
          - Interlocutors: ${interlocutors.map(({ name, description, gender }) => `${name} (${description}, gender: ${gender})`).join(', ')}
          ${hasVariables ? `- Scene colour (reflect this in tone, do not state it explicitly): ${JSON.stringify(variables)}` : ''}
          ${hasWorldFacts ? `- Established world facts (already true — NEVER contradict or repeat as if new): ${JSON.stringify(worldFacts)}` : ''}

          YOUR RULES:
          1. Use the <dialogue-history> provided in the user message to maintain continuity.
          2. Improvise the next line of dialogue based on the <stage-directions> provided. STRICTLY obey these directions.
          3. Tone & Atmosphere: Match the authentic atmosphere of the setting (e.g. a lively, welcoming Parisian café: warm, polite with standard vouvoiement, hospitable, and conversational — never robotic or overly stiff). Vary your phrasing across turns; avoid repeating identical stock formulas or repetitive sentence structures.
          4. Do not repeat greetings, introductions, or information already established in the <dialogue-history>.
          5. Always acknowledge the other character's statement or answer their question naturally before moving on to the instructions in the <stage-directions> block. If the student shares small talk (e.g., remarks on the weather, compliments the café), acknowledge it warmly with a brief natural touch.
          6. Do not jump straight to the <stage-directions> if the previous line requires a reaction.
          7. Do not advance the scene beyond what is explicitly requested in the <stage-directions>. Do not offer things (like seating, menus, or help) unless specifically instructed.
          8. NEVER make decisions for the student or offer shortcuts (e.g., do not say 'sit anywhere you like' if the directions ask you to prompt for a preference). Let the student do the communicative work, but remain patient and supportive. Use open-ended, natural questions (e.g. 'Qu\'est-ce qui vous ferait plaisir ce matin ?', 'Je vous laisse regarder la carte') rather than rigid or demanding commands.
          9. Provide the spoken dialogue text. If the stage directions require you to perform a physical action (like walking, handing over a menu, or leading the guest), output it in the 'action' field. Describe the action concisely in the third person present tense (e.g., 'leads the guest inside').
          10. Do NOT include your character's name, parentheticals (like "(angrily)"), or stage directions in the dialogue text.
          11. Pay close attention to gender-specific language (pronouns, terms of address like 'Monsieur'/'Madame', and grammatical agreement) based on your gender (${role.gender}) and the gender of your interlocutors.
          12. Never contradict an established world fact, and never perform or announce an action that a world fact says already happened.

          You are now in character.`;

  const userPrompt = `
          <dialogue-history>
            ${dialogue}
          </dialogue-history>

          <stage-directions>
            ${stageDirections.length > 0 ? stageDirections.join(', ') : 'Respond naturally to the last speaker and continue the scene.'}
          </stage-directions>

          ${role.name}:`;

  return {
    systemMessage: { role: 'system', content: systemPrompt },
    userMessage: { role: 'user', content: userPrompt }
  };
}

export async function runActorAgent(context: ActorAgentContext) {
  const { model } = context;
  const { systemMessage, userMessage } = buildActorMessages(context);

  const result = streamText({
    model,
    instructions: systemMessage,
    messages: [userMessage],
    output: Output.object({ schema: actorOutputSchema })
  });

  return Object.assign(result, { systemMessage, userMessage });
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
