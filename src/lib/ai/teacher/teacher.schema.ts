import { z } from 'zod';

import type { AgentContext } from '#lib/ai/types';
import { characterRoleSchema } from '#lib/scenario/schema';

export const teacherInputSchema = z.object({
  actions: z.array(z.string()),
  dialogue: z.string(),
  input: z.string(),
  interlocutors: z.array(characterRoleSchema),
  language: z.string(),
  role: characterRoleSchema,
  slugline: z.string()
});

export type TeacherAgentInput = z.infer<typeof teacherInputSchema>;
export type TeacherAgentContext = AgentContext & TeacherAgentInput;

export const teacherOutputSchema = z.object({
  agent: z.literal('teacher'),
  text: z.string(),
  passed: z.boolean()
});

export type TeacherOutput = z.infer<typeof teacherOutputSchema>;
