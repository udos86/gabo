import type { UIMessage } from "ai";
import { z } from "zod";

export const actorOutputSchema = z.object({
  agent: z.literal("actor"),
  text: z.string()
});

export type ActorOutput = z.infer<typeof actorOutputSchema>;

export const teacherOutputSchema = z.object({
  agent: z.literal("teacher"),
  text: z.string(),
  succeeded: z.boolean(),
});

export type TeacherOutput = z.infer<typeof teacherOutputSchema>;

export const agentOutputSchema = z.discriminatedUnion("agent", [
  actorOutputSchema,
  teacherOutputSchema
]);

export type AgentOutput = z.infer<typeof agentOutputSchema>;

export const messageMetadataSchema = z.object({
  agent: z.enum(["actor", "teacher"]),
  position: z.tuple([z.number(), z.number()]),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;
export type GaboUIMessage = UIMessage<MessageMetadata>;
