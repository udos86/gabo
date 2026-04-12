import { Output, streamText, type LanguageModel } from "ai";

import type { Beat } from "$lib/screenplay/screenplay";
import { teacherOutputSchema } from "./schema";

export interface TeacherAgentContext {
  actions: Beat['actions'];
  dialogue: string[];
  input: string;
  language: string;
  model: LanguageModel;
  slugline: string;
}

export async function runTeacherAgent({ actions, dialogue, input, language, model, slugline }: TeacherAgentContext) {
  return streamText({
    model,
    messages: [{
      role: 'system',
      content: `        
        You are a ${language} teacher agent. 
        You will evaluate how fluent a student holds a conversation in ${language}.
        You will return whether the student passes the excercise and provide feedback.
        The dialog line entered by the student should be grammatically correct, contextually appropriate and reflect a given set of actions.
        The scene slugline is: ${slugline}
        The previous dialog is: ${dialogue.join(' ')}
        The student input is: ${input}
        The actions are: ${actions.join(', ')}`
    }],
    output: Output.object({ schema: teacherOutputSchema })
  });
}
