import type { UIMessage } from 'ai';
import { z } from 'zod';

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

export type UserMessageMetadata = z.infer<typeof userMessageMetadataSchema>;
export type AssistantMessageMetadata = z.infer<typeof actorMessageMetadataSchema>;
export type MessageMetadata = UserMessageMetadata | AssistantMessageMetadata;

export type UserUIMessage = UIMessage<MessageMetadata> & {
  role: 'user';
  metadata: UserMessageMetadata;
};

export type AssistantUIMessage = UIMessage<MessageMetadata> & {
  role: 'assistant';
  metadata: AssistantMessageMetadata;
};

export type GaboUIMessage = UserUIMessage | AssistantUIMessage;

export function convertToDialogue(
  messages: Array<GaboUIMessage>,
  characters: Record<string, { role: { name: string } }>
) {
  return messages
    .filter(({ role, metadata }) => role === 'user' || metadata?.agent === 'actor')
    .filter(({ metadata }) => metadata.status === 'done')
    .filter(({ parts }) => parts.some((part) => part.type === 'text'))
    .map(({ parts, metadata }) => {
      const textPart = parts.find((part) => part.type === 'text')!;
      const character = characters[metadata!.characterId];
      const name = character?.role.name ?? metadata!.characterId;
      return `${name}: ${textPart.text}`;
    })
    .join('\n');
}
