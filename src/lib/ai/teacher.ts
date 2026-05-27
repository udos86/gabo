import { Output, streamText } from "ai";

import { teacherOutputSchema, type TeacherAgentContext } from "$lib/ai/schema";

export async function runTeacherAgent({ actions, dialogue, input, interlocutors, language, model, role, slugline }: TeacherAgentContext) {
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
          - Interlocutors: ${interlocutors.map(({ name, description, gender }) => `${name} (${description}, gender: ${gender})`).join(', ')}

          YOUR EVALUATION RULES:
          1. Grammar: check for tense agreement, word order, and spelling.
          2. Context: check if the <student-input> logically follows the <dialogue-history> and correctly addresses the interlocutors.
          3. Actions: check if the student fulfilled all points in the provided <actions>.
          4. Naturalness: check if the response is natural and idiomatic.
          5. Tone: check if the tone is appropriate for the scene.

          YOUR FEEDBACK RULES:
          - Always provide feedback in the same language as the student input.
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
