import type { UIMessage } from "ai";
import { z } from "zod";

export const messageMetadataSchema = z.object({
  agent: z.enum(["actor", "teacher", "mock"]),
  hidden: z.boolean().optional(),
  language: z.string(),
  slugline: z.string(),
  role: z.string(),
  actions: z.array(z.string()),
  input: z.string().optional(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;
export type GaboUIMessage = UIMessage<MessageMetadata>;
