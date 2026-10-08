import { deriveMaxTurns, type MilestoneDef, type MilestoneId, type Scenario } from './scenario';
import type { DirectorOutput, LessonState, LessonStatus, MilestoneStatus } from './state';

/** Number of consecutive attempts on the focus milestone before switching to repair mode. */
const REPAIR_ATTEMPT_THRESHOLD = 2;
/** Fraction of the turn budget after which the Director starts applying story pressure. */
const PRESSURE_RATIO = 0.75;

export type Rng = () => number;

/**
 * Constructs a lookup Map from milestone ID to its definition for fast O(1) resolution.
 *
 * @param scenario - The scenario configuration containing all milestone definitions.
 * @returns A Map keyed by `MilestoneId` pointing to the corresponding `MilestoneDef`.
 */
function milestoneMap(scenario: Scenario): Map<MilestoneId, MilestoneDef> {
  return new Map(scenario.milestones.map((milestone) => [milestone.id, milestone]));
}

/**
 * Evaluates whether all prerequisite milestones for a given milestone have been completed.
 *
 * Traverses the milestone's prerequisite list against the current lesson status dictionary.
 * Returns false if the milestone definition does not exist or if any prerequisite is not 'done'.
 *
 * @param defs - Map of milestone definitions keyed by ID.
 * @param statuses - Current status dictionary mapping each milestone ID to its MilestoneStatus.
 * @param id - The ID of the milestone whose prerequisites are being verified.
 * @returns `true` if all prerequisites are marked as 'done'; otherwise `false`.
 */
function prereqsDone(defs: Map<MilestoneId, MilestoneDef>, statuses: Record<MilestoneId, MilestoneStatus>, id: MilestoneId): boolean {
  const def = defs.get(id);
  if (def === undefined) return false;
  return def.prerequisites.every((prereq) => statuses[prereq] === 'done');
}

/**
 * Promotes `locked` milestones whose prerequisites are all satisfied to `eligible` status,
 * and rolls random probability checks for any attached narrative frictions.
 *
 * When a milestone becomes eligible for the first time:
 * 1. Its status transitions from 'locked' to 'eligible'.
 * 2. Any narrative frictions attached to it that are neither active nor previously resolved
 *    are evaluated against their trigger probability via the provided RNG.
 *
 * Note: This function directly mutates the passed `statuses` and `activeFrictions` collections
 * for in-place state progression during reduction cycles.
 *
 * @param scenario - The active scenario containing milestone and friction specifications.
 * @param defs - Map of milestone definitions for prerequisite lookups.
 * @param statuses - Mutable dictionary of milestone statuses being updated.
 * @param activeFrictions - Mutable list of currently active friction IDs.
 * @param resolvedFrictions - List of friction IDs that have already been resolved.
 * @param rng - Deterministic or pseudo-random number generator producing values in [0, 1).
 * @returns Array of milestone IDs that transitioned to 'eligible' in this pass.
 */
function recomputeEligibility(scenario: Scenario, defs: Map<MilestoneId, MilestoneDef>, statuses: Record<MilestoneId, MilestoneStatus>, activeFrictions: string[], resolvedFrictions: string[], rng: Rng): MilestoneId[] {
  const newlyEligible: MilestoneId[] = [];

  for (const milestone of scenario.milestones) {
    if (statuses[milestone.id] === 'locked' && prereqsDone(defs, statuses, milestone.id)) {
      statuses[milestone.id] = 'eligible';
      newlyEligible.push(milestone.id);

      for (const friction of scenario.frictions) {
        if (
          friction.attachesTo === milestone.id &&
          !activeFrictions.includes(friction.id) &&
          !resolvedFrictions.includes(friction.id) &&
          rng() < friction.probability
        ) {
          activeFrictions.push(friction.id);
        }
      }
    }
  }

  return newlyEligible;
}

/**
 * Determines the current focus milestone to guide the pedagogical and narrative direction.
 *
 * Candidate milestones must have a status of either 'eligible' or 'active'.
 * Priority is given strictly to mandatory (non-optional) milestones first,
 * breaking ties by scenario declaration order. If all mandatory candidates are exhausted,
 * eligible optional milestones are selected.
 *
 * @param scenario - The scenario containing ordered milestone definitions.
 * @param statuses - Dictionary of current milestone statuses.
 * @returns The ID of the milestone to focus on, or `null` if no eligible candidates remain.
 */
function selectFocus(scenario: Scenario, statuses: Record<MilestoneId, MilestoneStatus>): MilestoneId | null {
  const candidates = scenario.milestones.filter(
    (milestone) => statuses[milestone.id] === 'eligible' || statuses[milestone.id] === 'active'
  );
  if (candidates.length === 0) return null;

  const mandatory = candidates.filter((milestone) => !milestone.optional);
  const pool = mandatory.length > 0 ? mandatory : candidates;
  return pool[0]!.id;
}

/**
 * Initializes a new lesson state from a scenario specification.
 *
 * Performs initial setup:
 * 1. Selects initial narrative variable assignments (e.g. waiter mood, café busyness) using the RNG.
 * 2. Initializes all milestone statuses to 'locked' and attempt counters to 0.
 * 3. Computes initial eligibility (unlocking root milestones with no prerequisites) and rolls initial frictions.
 * 4. Selects the opening focus milestone and marks it as 'active'.
 * 5. Derives turn budget (`maxTurns`) based on scenario slack and friction costs.
 *
 * @param scenario - The scenario defining the setting, milestones, frictions, and variables.
 * @param rng - Pseudo-random number generator for variable rolls and friction probabilities (defaults to Math.random).
 * @returns The fully initialized, authoritative `LessonState` ready for turn 1.
 */
export function createInitialState(scenario: Scenario, rng: Rng = Math.random): LessonState {
  const defs = milestoneMap(scenario);

  const variables: Record<string, string> = {};
  for (const [key, options] of Object.entries(scenario.variableSpec)) {
    if (options.length > 0) {
      const index = Math.min(options.length - 1, Math.floor(rng() * options.length));
      variables[key] = options[index]!;
    }
  }

  const statuses: Record<MilestoneId, MilestoneStatus> = {};
  const attempts: Record<MilestoneId, number> = {};
  for (const milestone of scenario.milestones) {
    statuses[milestone.id] = 'locked';
    attempts[milestone.id] = 0;
  }

  const activeFrictions: string[] = [];
  recomputeEligibility(scenario, defs, statuses, activeFrictions, [], rng);

  const focusMilestoneId = selectFocus(scenario, statuses);
  if (focusMilestoneId !== null) statuses[focusMilestoneId] = 'active';

  return {
    scenarioId: scenario.id,
    turn: 1,
    maxTurns: deriveMaxTurns(scenario),
    variables,
    milestones: statuses,
    slots: {},
    worldFacts: {},
    activeFrictions,
    resolvedFrictions: [],
    focusMilestoneId,
    attempts,
    pendingCompletions: [],
    offTopicStreak: 0,
    mode: 'advance',
    pendingNpcAction: null,
    status: 'in_progress'
  };
}

/**
 * Deterministically applies a Director LLM agent's proposed deltas to produce the next lesson state.
 *
 * The reducer acts as the authoritative state harness for the conversation:
 * - **Idempotent completions:** Repeated completion signals for already-completed milestones are no-ops.
 * - **Run-ahead buffering (defer-don't-drop):** Proposed completions whose prerequisites are not yet met
 *   are safely queued in `pendingCompletions` and drained once dependencies unlock.
 * - **Provenance gating:** Slot writes and world facts are validated against scenario schema and turn freshness.
 * - **Pedagogical modes:** Automatically switches between 'advance', 'repair' (struggling on focus),
 *   'pressure' (budget exhaustion), and 'deflect' (off-topic student input).
 * - **Authoritative termination:** Sole authority determining 'won' (all mandatory milestones done)
 *   or 'timed_out' (turn budget exceeded).
 *
 * @param state - The current authoritative lesson state.
 * @param scenario - The scenario configuration and rules.
 * @param output - The structured proposals from the Director agent.
 * @param rng - Pseudo-random number generator for rolling newly unlocked frictions (defaults to Math.random).
 * @returns A fresh, immutable `LessonState` reflecting all committed state transitions.
 */
export function reduce(state: LessonState, scenario: Scenario, output: DirectorOutput, rng: Rng = Math.random): LessonState {
  const defs = milestoneMap(scenario);
  const statuses: Record<MilestoneId, MilestoneStatus> = { ...state.milestones };
  const slots = { ...state.slots };
  const worldFacts = { ...state.worldFacts };
  const attempts = { ...state.attempts };
  const activeFrictions = [...state.activeFrictions];
  const resolvedFrictions = [...state.resolvedFrictions];
  const pendingCompletions = [...state.pendingCompletions];

  /**
   * Attempts to mark a milestone as 'done' if its prerequisites are satisfied.
   *
   * If prerequisites are met:
   * - Sets milestone status to 'done'.
   * - Resets attempt counter for this milestone to 0.
   * - Resolves and clears any active frictions attached to this milestone.
   *
   * @param id - The milestone ID to complete.
   * @returns `true` if the milestone is done or successfully transitioned to done; `false` if prerequisites are unmet or ID is invalid.
   */
  const tryComplete = (id: MilestoneId): boolean => {
    const status = statuses[id];
    if (status === undefined) return false; // unknown id -> reject
    if (status === 'done') return true; // idempotent no-op
    if ((status === 'eligible' || status === 'active') && prereqsDone(defs, statuses, id)) {
      statuses[id] = 'done';
      attempts[id] = 0;
      
      for (const friction of scenario.frictions) {
        if (friction.attachesTo === id) {
          const index = activeFrictions.indexOf(friction.id);
          if (index !== -1) {
            activeFrictions.splice(index, 1);
            if (!resolvedFrictions.includes(friction.id)) resolvedFrictions.push(friction.id);
          }
        }
      }
      return true;
    }
    return false; // prereqs unmet -> caller may buffer
  };

  // 1. Milestone completions (idempotent, defer-don't-drop).
  for (const id of output.observedDeltas.completedMilestones) {
    if (statuses[id] === undefined) continue; // reject unknown
    const committed = tryComplete(id);
    if (!committed && !pendingCompletions.includes(id)) pendingCompletions.push(id);
  }

  // 2. Slot fills (provenance-gated, id-validated) + world facts.
  const validSlotIds = new Set(scenario.slots.map((slot) => slot.id));
  for (const fill of output.observedDeltas.filledSlots) {
    if (!validSlotIds.has(fill.slotId)) continue; // unknown/hallucinated slot id -> reject
    if (fill.evidenceTurn !== state.turn) continue; // stale/hallucinated write -> reject
    slots[fill.slotId] = { value: fill.value, turn: fill.evidenceTurn };
  }
  if (output.worldFactUpdates !== undefined) {
    for (const { key, value } of output.worldFactUpdates) worldFacts[key] = value;
  }

  // 3. Resolve frictions.
  for (const id of output.observedDeltas.resolvedFrictions) {
    const index = activeFrictions.indexOf(id);
    if (index !== -1) {
      activeFrictions.splice(index, 1);
      if (!resolvedFrictions.includes(id)) resolvedFrictions.push(id);
    }
  }

  // 4. Recompute eligibility + drain buffered completions until stable.
  let changed = true;
  while (changed) {
    changed = false;
    recomputeEligibility(scenario, defs, statuses, activeFrictions, resolvedFrictions, rng);
    for (let i = pendingCompletions.length - 1; i >= 0; i--) {
      const id = pendingCompletions[i]!;
      if (tryComplete(id)) {
        pendingCompletions.splice(i, 1);
        changed = true;
      }
    }
  }

  // 5. Attempts + off-topic streak, relative to the focus we were working on.
  const previousFocus = state.focusMilestoneId;
  if (previousFocus !== null && statuses[previousFocus] !== 'done') {
    attempts[previousFocus] = (attempts[previousFocus] ?? 0) + 1;
  }
  const offTopicStreak = output.observedDeltas.offTopic ? state.offTopicStreak + 1 : 0;

  // 6. Select next focus.
  const focusMilestoneId = selectFocus(scenario, statuses);
  if (focusMilestoneId !== null && statuses[focusMilestoneId] === 'eligible') {
    statuses[focusMilestoneId] = 'active';
  }

  // 7. Compute mode (precedence: deflect > repair > pressure > advance).
  const turn = state.turn + 1;
  const focusAttempts = focusMilestoneId !== null ? (attempts[focusMilestoneId] ?? 0) : 0;
  let mode: LessonState['mode'];
  if (offTopicStreak > 0) mode = 'deflect';
  else if (focusAttempts >= REPAIR_ATTEMPT_THRESHOLD) mode = 'repair';
  else if (turn / state.maxTurns >= PRESSURE_RATIO) mode = 'pressure';
  else mode = 'advance';

  // 8. Win / timeout.
  const mandatoryDone = scenario.milestones
    .filter((milestone) => !milestone.optional)
    .every((milestone) => statuses[milestone.id] === 'done');
  // storyComplete is an LLM signal only; the reducer stays the sole authority on winning.
  let status: LessonStatus;
  if (mandatoryDone) status = 'won';
  else if (turn > state.maxTurns) status = 'timed_out';
  else status = 'in_progress';

  return {
    ...state,
    turn,
    milestones: statuses,
    slots,
    worldFacts,
    activeFrictions,
    resolvedFrictions,
    focusMilestoneId,
    attempts,
    pendingCompletions,
    offTopicStreak,
    mode,
    status
  };
}
