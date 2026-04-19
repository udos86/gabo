import { Output, streamText, type LanguageModel } from "ai";

import type { Beat, CharacterRole } from "$lib/screenplay/screenplay";
import { teacherOutputSchema } from "./schema";

export interface TeacherAgentContext {
  actions: Beat['actions'];
  dialogue: string;
  input: string;
  language: string;
  model: LanguageModel;
  role: CharacterRole;
  slugline: string;
}

export async function runTeacherAgent({ actions, dialogue, input, language, model, role, slugline }: TeacherAgentContext) {
  return streamText({
    model,
    messages: [
      {
        role: 'system',
        content: `
          You are an expert ${language} Teacher and Dialogue Evaluator. 
          Your task is to evaluate the <student-input> provided in the user message as part of a conversation in a roleplay.
          You will return whether the student passes the excercise and provide feedback according to the rules below.

          CONTEXT:
          - Language: ${language}
          - Scene Slugline: ${slugline}
          - Student role: ${role.description}

          YOUR EVALUATION RULES:
          1. GRAMMAR: check for tense agreement, word order, and spelling.
          2. CONTEXT: check if the <student-input> logically follows the <dialogue-history>.
          3. ACTIONS: check if the student fulfilled all points in the provided <actions>.
          4. NATURALNESS: check if the response is natural and idiomatic.
          5. TONE: check if the tone is appropriate for the scene.

          YOUR FEEDBACK RULES:
          - If the student passes the excercise, provide significant feedback in 20 words or less.
          - If the student fails the excercise, provide feedback in 40 words or less.
          
          Be a strict yet encouraging teacher.`
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

          <student-input>
            ${input}
          </student-input>

          Please evaluate the student-input based on the dialogue-history and actions.`
      }
    ],
    output: Output.object({ schema: teacherOutputSchema })
  });
}
