import { z } from 'zod';

import type { AgentContext } from '#lib/ai/types';
import { characterRoleSchema } from '#lib/scenario/schema';

export const directorMilestoneViewSchema = z.object({
  id: z.string(),
  objective: z.string(),
  kind: z.string(),
  effectiveRubric: z.string(),
  status: z.string(),
  optional: z.boolean(),
  fillsSlots: z.array(z.string()),
  npcAssumption: z.string().optional()
});

export type DirectorMilestoneView = z.infer<typeof directorMilestoneViewSchema>;

export const directorSlotViewSchema = z.object({
  id: z.string(),
  description: z.string()
});

export type DirectorSlotView = z.infer<typeof directorSlotViewSchema>;

export const directorFrictionViewSchema = z.object({
  id: z.string(),
  description: z.string(),
  extraObjective: z.string()
});

export type DirectorFrictionView = z.infer<typeof directorFrictionViewSchema>;

export const directorInputSchema = z.object({
  language: z.string(),
  slugline: z.string(),
  goal: z.string(),
  role: characterRoleSchema,
  interlocutors: z.array(characterRoleSchema),
  variables: z.record(z.string(), z.string()),
  worldFacts: z.record(z.string(), z.union([z.boolean(), z.string()])),
  milestones: z.array(directorMilestoneViewSchema),
  slots: z.array(directorSlotViewSchema),
  focusMilestoneId: z.string().nullable(),
  activeFrictions: z.array(directorFrictionViewSchema),
  mode: z.enum(['advance', 'repair', 'pressure', 'deflect']),
  turn: z.number(),
  maxTurns: z.number(),
  dialogue: z.string(),
  studentInput: z.string()
});

export type DirectorAgentInput = z.infer<typeof directorInputSchema>;
export type DirectorAgentContext = AgentContext & DirectorAgentInput;

/**
 * The Director senses milestone deltas AND authors the next stage directions in
 * a single call. Every delta is a PROPOSAL; the reducer validates and applies
 * them idempotently against the DAG.
 */
export const directorOutputSchema = z.object({
  agent: z.literal('director'),
  observedDeltas: z.object({
    completedMilestones: z.array(z.string()),
    filledSlots: z.array(
      z.object({
        slotId: z.string(),
        value: z.string(),
        /** The turn whose utterance justifies the fill; reducer rejects stale writes. */
        evidenceTurn: z.number()
      })
    ),
    resolvedFrictions: z.array(z.string()),
    offTopic: z.boolean()
  }),
  /** Stage directions handed to the Actor. */
  stageDirections: z.array(z.string()),
  /**
   * NPC actions performed this turn (e.g. menu_given: true) — folded into
   * worldFacts by the reducer. Modelled as an array (not a map) because OpenAI's
   * strict structured-output mode forbids open-ended record schemas.
   */
  worldFactUpdates: z.array(
    z.object({
      key: z.string(),
      value: z.union([z.boolean(), z.string()])
    })
  ),
  storyComplete: z.boolean()
});

export type DirectorOutput = z.infer<typeof directorOutputSchema>;
