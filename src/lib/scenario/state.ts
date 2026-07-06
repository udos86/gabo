import { z } from 'zod';

import type { FrictionId, MilestoneId, SlotId } from './scenario';

export type MilestoneStatus = 'locked' | 'eligible' | 'active' | 'done' | 'skipped';
export type DirectorMode = 'advance' | 'repair' | 'pressure' | 'deflect';

/** Slot value carries provenance: the turn whose utterance justified the write. */
export interface SlotValue {
  value: string | null;
  turn: number;
}

export interface LessonState {
  scenarioId: string;
  turn: number;
  maxTurns: number;
  /** Rolled once at the start of the run from the scenario's variableSpec. */
  variables: Record<string, string>;
  milestones: Record<MilestoneId, MilestoneStatus>;
  slots: Record<SlotId, SlotValue | undefined>;
  /** World facts injected into the Actor so it never contradicts what already happened. */
  worldFacts: Record<string, boolean | string>;
  activeFrictions: FrictionId[];
  resolvedFrictions: FrictionId[];
  /** Code-selected target milestone; drives mode selection. */
  focusMilestoneId: MilestoneId | null;
  attempts: Record<MilestoneId, number>;
  /** Run-ahead completions whose prerequisites are not yet met (defer-don't-drop). */
  pendingCompletions: MilestoneId[];
  offTopicStreak: number;
  mode: DirectorMode;
  pendingNpcAction: string | null;
  status: 'in_progress' | 'won' | 'timed_out';
}

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
  /** Stage directions handed to the Actor`. */
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
