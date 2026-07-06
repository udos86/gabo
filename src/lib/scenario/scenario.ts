import { z } from 'zod';

import { characterRoleSchema } from '$lib/ai/schema';

export type MilestoneId = string;
export type SlotId = string;
export type FrictionId = string;
export type CharacterId = string;

/**
 * A milestone is a communicative objective. Mandatory milestones form the win
 * condition; optional milestones are side-quests that never block completion.
 * Prerequisites form a DAG that the reducer uses to gate eligibility.
 */
export const milestoneDefSchema = z.object({
  id: z.string(),
  objective: z.string(),
  /** `student` = the learner must produce something; `world` = an NPC action / world fact. */
  kind: z.enum(['student', 'world']),
  prerequisites: z.array(z.string()).default([]),
  /** Completion criteria the Director judges against (temperature 0 for stability). */
  rubric: z.string(),
  fillsSlots: z.array(z.string()).default([]),
  optional: z.boolean().default(false)
});

export const slotDefSchema = z.object({
  id: z.string(),
  description: z.string()
});

/**
 * A friction is a conditional MODIFIER on an existing (usually mandatory)
 * milestone. It never removes a milestone from the DAG — it only augments the
 * milestone's effective rubric with an extra objective, making the same goal
 * harder to reach. This makes unwinnability-by-friction structurally impossible.
 */
export const frictionDefSchema = z.object({
  id: z.string(),
  attachesTo: z.string(),
  description: z.string(),
  extraObjective: z.string(),
  rubric: z.string(),
  /** Rolled when `attachesTo` becomes eligible. Drives run-to-run divergence. */
  probability: z.number().min(0).max(1),
  /** Expected turns to overcome; feeds derived maxTurns budgeting. */
  avgTurnCost: z.number().min(0)
});

export const scenarioCharacterSchema = z.object({
  id: z.string(),
  actor: z.enum(['assistant', 'user']),
  role: characterRoleSchema,
  avatarUrl: z.string()
});

export const scenarioSchema = z.object({
  id: z.string(),
  language: z.string(),
  setting: z.object({ slugline: z.string(), description: z.string() }),
  goal: z.string(),
  /** Author difficulty via slack (1.5 generous … 1.1 tight); maxTurns is derived, not raw. */
  slack: z.number().min(1).default(1.4),
  characters: z.record(z.string(), scenarioCharacterSchema),
  playerCharacterId: z.string(),
  npcCharacterId: z.string(),
  milestones: z.array(milestoneDefSchema),
  slots: z.array(slotDefSchema).default([]),
  frictions: z.array(frictionDefSchema).default([]),
  /** One value rolled per key at start of a run (busy/empty café, grumpy/cheerful waiter, …). */
  variableSpec: z.record(z.string(), z.array(z.string())).default({})
});

export type MilestoneDef = z.infer<typeof milestoneDefSchema>;
export type SlotDef = z.infer<typeof slotDefSchema>;
export type FrictionDef = z.infer<typeof frictionDefSchema>;
export type ScenarioCharacter = z.infer<typeof scenarioCharacterSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;

/**
 * Derive the turn budget from the mandatory milestone count plus the expected
 * cost of enabled frictions, scaled by slack. Prevents timeout-by-construction.
 */
export function deriveMaxTurns(scenario: Scenario): number {
  const mandatoryCount = scenario.milestones.filter((milestone) => !milestone.optional).length;
  const expectedFrictionCost = scenario.frictions.reduce(
    (total, friction) => total + friction.probability * friction.avgTurnCost,
    0
  );
  return Math.ceil((mandatoryCount + expectedFrictionCost) * scenario.slack);
}
