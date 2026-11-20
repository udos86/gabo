import { z } from 'zod';

import type { AgentContext } from '#lib/ai/types';
import { characterRoleSchema } from '#lib/scenario/schema';

export const actorInputSchema = z.object({
  dialogue: z.string(),
  interlocutors: z.array(characterRoleSchema),
  language: z.string(),
  role: characterRoleSchema,
  stageDirections: z.array(z.string()),
  slugline: z.string(),
  /** Facts already true in the world; the Actor must never contradict them. */
  worldFacts: z.record(z.string(), z.union([z.boolean(), z.string()])).optional(),
  /** Per-run variables (e.g. waiter mood) that colour the Actor's delivery. */
  variables: z.record(z.string(), z.string()).optional()
});

export type ActorAgentInput = z.infer<typeof actorInputSchema>;
export type ActorAgentContext = AgentContext & ActorAgentInput;

export const actorOutputSchema = z.object({
  agent: z.literal('actor'),
  text: z.string(),
  action: z.string().nullable().describe('A physical action or narrative beat the character performs. Null if no action.')
});

export type ActorOutput = z.infer<typeof actorOutputSchema>;
