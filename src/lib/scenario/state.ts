import { z } from 'zod';

import type { FrictionId, MilestoneId, SlotId } from './scenario';

export type MilestoneStatus = 'locked' | 'eligible' | 'active' | 'done' | 'skipped';
export type DirectorMode = 'advance' | 'repair' | 'pressure' | 'deflect';
export type LessonStatus = 'in_progress' | 'won' | 'timed_out';

/** Slot value carries provenance: the turn whose utterance justified the write. */
export interface SlotValue {
  value: string | null;
  turn: number;
}

export interface LessonState {
  /** The unique identifier of the scenario being executed (e.g. 'cafe-001'). */
  scenarioId: string;

  /** The current 1-indexed turn number of the lesson session. */
  turn: number;

  /** The maximum turn budget allocated for this session before timing out. */
  maxTurns: number;

  /** Narrative variables sampled once at session start from `variableSpec` (e.g. waiter mood, busyness). */
  variables: Record<string, string>;

  /** Authoritative lifecycle status dictionary mapping each milestone ID to its current state ('locked', 'eligible', 'active', 'done', 'skipped'). */
  milestones: Record<MilestoneId, MilestoneStatus>;

  /** Extracted entity values filled during dialogue, tracked alongside the turn index where evidence was provided. */
  slots: Record<SlotId, SlotValue | undefined>;

  /** Ground-truth world facts accumulated during conversation, injected into the Actor to prevent hallucinations and contradictions. */
  worldFacts: Record<string, boolean | string>;

  /** Active, unresolved narrative obstacle/friction IDs currently challenging the student (e.g. 'terrace_full'). */
  activeFrictions: FrictionId[];

  /** Narrative obstacle/friction IDs that have already been resolved during this session. */
  resolvedFrictions: FrictionId[];

  /** Code-selected primary target milestone currently being pursued; dictates mode selection and NPC prompting. */
  focusMilestoneId: MilestoneId | null;

  /** Number of consecutive failed attempts spent trying to satisfy each milestone; drives repair mode threshold. */
  attempts: Record<MilestoneId, number>;

  /** Buffered milestone completions achieved ahead of time whose prerequisites have not yet unlocked (defer-don't-drop queue). */
  pendingCompletions: MilestoneId[];

  /** Number of consecutive turns the student has spoken off-topic; triggers deflect mode when greater than zero. */
  offTopicStreak: number;

  /** Current conversational/pedagogical mode determined by the reducer ('advance', 'repair', 'pressure', 'deflect'). */
  mode: DirectorMode;

  /** Optional stage direction or physical action queued for the NPC's upcoming turn. */
  pendingNpcAction: string | null;

  /** Authoritative overall session status ('in_progress', 'won' when mandatory milestones are complete, or 'timed_out'). */
  status: LessonStatus;
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
