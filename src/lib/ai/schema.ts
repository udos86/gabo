import type { UIMessage, LanguageModel } from 'ai';
import { z } from 'zod';

export const characterRoleSchema = z.object({
  name: z.string(),
  description: z.string(),
  gender: z.enum(['male', 'female', 'diverse'])
});

export const actorInputSchema = z.object({
  actions: z.array(z.string()),
  dialogue: z.string(),
  interlocutors: z.array(characterRoleSchema),
  language: z.string(),
  role: characterRoleSchema,
  slugline: z.string()
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
  text: z.string()
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
  position: z.tuple([z.number(), z.number()]),
  status: z.enum(['pending', 'ready', 'animating', 'done'])
});

export const assistantMessageMetadataSchema = messageMetadataSchema.extend({
  agent: z.enum(['actor', 'teacher'])
});

export const actorMessageMetadataSchema = messageMetadataSchema.extend({
  agent: z.literal('actor')
});

export const teacherMessageMetadataSchema = messageMetadataSchema.extend({
  agent: z.literal('teacher'),
  passed: z.boolean().optional()
});

export type AgentName = 'actor' | 'teacher';
export type AgentInput = ActorAgentInput | TeacherAgentInput;

export type UserMessageMetadata = z.infer<typeof messageMetadataSchema>;
export type AssistantMessageMetadata = z.infer<typeof actorMessageMetadataSchema> | z.infer<typeof teacherMessageMetadataSchema>;

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
