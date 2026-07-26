import type { UIMessage, LanguageModel } from 'ai';
import { z } from 'zod';

export const characterRoleSchema = z.object({
  name: z.string(),
  description: z.string(),
  gender: z.enum(['male', 'female', 'diverse'])
});

export type CharacterRoleInput = z.infer<typeof characterRoleSchema>;

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

export type AgentContext = { model: LanguageModel };

export type ActorAgentInput = z.infer<typeof actorInputSchema>;

export type ActorAgentContext = AgentContext & ActorAgentInput;

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

export const actorOutputSchema = z.object({
  agent: z.literal('actor'),
  text: z.string(),
  action: z.string().nullable().describe("A physical action or narrative beat the character performs. Null if no action.")
});

export type ActorOutput = z.infer<typeof actorOutputSchema>;

export const teacherOutputSchema = z.object({
  agent: z.literal('teacher'),
  text: z.string(),
  passed: z.boolean(),
});

export type TeacherOutput = z.infer<typeof teacherOutputSchema>;

export const agentOutputSchema = z.discriminatedUnion('agent', [
  actorOutputSchema,
  teacherOutputSchema
]);

export type AgentOutput = z.infer<typeof agentOutputSchema>;

export const messageMetadataSchema = z.object({
  characterId: z.string(),
  status: z.enum(['pending', 'ready', 'animating', 'done'])
});

export const userMessageMetadataSchema = messageMetadataSchema.extend({
  feedbackText: z.string().optional(),
  passed: z.boolean().optional()
});

export const actorMessageMetadataSchema = messageMetadataSchema.extend({
  agent: z.literal('actor'),
  action: z.string().optional()
});

export type AgentName = 'actor' | 'teacher';
export type AgentInput = ActorAgentInput | TeacherAgentInput;

export type UserMessageMetadata = z.infer<typeof userMessageMetadataSchema>;
export type AssistantMessageMetadata = z.infer<typeof actorMessageMetadataSchema>;

export type MessageMetadata = UserMessageMetadata | AssistantMessageMetadata;

export type UserUIMessage = UIMessage<MessageMetadata> & {
  role: 'user';
  metadata: UserMessageMetadata
};

export type AssistantUIMessage = UIMessage<MessageMetadata> & {
  role: 'assistant';
  metadata: AssistantMessageMetadata
};

export type GaboUIMessage = UserUIMessage | AssistantUIMessage;
