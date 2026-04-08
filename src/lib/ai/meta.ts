import type { UIMessage } from "ai";
import { z } from "zod";

export const messageMetadataSchema = z.object({
  agent: z.enum(["actor", "teacher", "mock"]),
  hidden: z.boolean().default(false),
  language: z.string(),
  slugline: z.string(),
  role: z.string(),
  actions: z.array(z.string())
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;
export type GaboUIMessage = UIMessage<MessageMetadata>;
