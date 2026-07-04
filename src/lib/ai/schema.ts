import type { UIMessage, LanguageModel } from 'ai';
import { z } from 'zod';

export const characterRoleSchema = z.object({
  name: z.string(),
  description: z.string(),
  gender: z.enum(['male', 'female', 'diverse'])
});

export const milestoneInputSchema = z.object({
  id: z.string(),
  description: z.string(),
  reached: z.boolean()
});

export const actorInputSchema = z.object({
  actions: z.array(z.string()),
  dialogue: z.string(),
  interlocutors: z.array(characterRoleSchema),
  language: z.string(),
  role: characterRoleSchema,
  slugline: z.string(),
  goal: z.string(),
  milestones: z.array(milestoneInputSchema),
  turnsRemaining: z.number(),
  characterIds: z.record(z.string(), z.string()),
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

export const nextBeatSchema = z.object({
  character: z.string().describe('The character ID of the next speaker.'),
  actions: z.array(z.string()).describe('What the next speaker should do or say.'),
  milestone: z.string().optional().describe('If this beat reaches a milestone, the milestone ID. Otherwise omit.'),
  completed: z.boolean().describe('True if the lesson goal is now fully achieved.'),
});

export type NextBeat = z.infer<typeof nextBeatSchema>;

export const actorOutputSchema = z.object({
  agent: z.literal('actor'),
  text: z.string().describe('The dialogue line to speak.'),
  nextBeat: nextBeatSchema,
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
  agent: z.literal('actor')
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
