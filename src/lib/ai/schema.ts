import { z } from "zod";

export const actorOutputSchema = z.object({
  text: z.string()
});

export type ActorOutput = z.infer<typeof actorOutputSchema>;

export const teacherOutputSchema = z.object({
  succeeded: z.boolean(),
  feedback: z.string()
});

export type TeacherOutput = z.infer<typeof teacherOutputSchema>;
