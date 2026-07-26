import { deriveMaxTurns, type MilestoneDef, type MilestoneId, type Scenario } from './scenario';
import type { DirectorOutput, LessonState, MilestoneStatus } from './state';

/** Number of consecutive attempts on the focus milestone before switching to repair mode. */
const REPAIR_ATTEMPT_THRESHOLD = 2;
/** Fraction of the turn budget after which the Director starts applying story pressure. */
const PRESSURE_RATIO = 0.75;

export type Rng = () => number;

function milestoneMap(scenario: Scenario): Map<MilestoneId, MilestoneDef> {
  return new Map(scenario.milestones.map((milestone) => [milestone.id, milestone]));
}

function prereqsDone(
  defs: Map<MilestoneId, MilestoneDef>,
  statuses: Record<MilestoneId, MilestoneStatus>,
  id: MilestoneId
): boolean {
  const def = defs.get(id);
  if (def === undefined) return false;
  return def.prerequisites.every((prereq) => statuses[prereq] === 'done');
}

/**
 * Promote `locked` milestones whose prerequisites are all done to `eligible`.
 * When a milestone becomes newly eligible, roll each attached friction. Mutates
 * the passed statuses/activeFrictions and returns the ids that became eligible.
 */
function recomputeEligibility(
  scenario: Scenario,
  defs: Map<MilestoneId, MilestoneDef>,
  statuses: Record<MilestoneId, MilestoneStatus>,
  activeFrictions: string[],
  resolvedFrictions: string[],
  rng: Rng
): MilestoneId[] {
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

/** Mandatory-first priority among eligible/active, then scenario order. */
function selectFocus(
  scenario: Scenario,
  statuses: Record<MilestoneId, MilestoneStatus>
): MilestoneId | null {
  const candidates = scenario.milestones.filter(
    (milestone) => statuses[milestone.id] === 'eligible' || statuses[milestone.id] === 'active'
  );
  if (candidates.length === 0) return null;

  const mandatory = candidates.filter((milestone) => !milestone.optional);
  const pool = mandatory.length > 0 ? mandatory : candidates;
  return pool[0]!.id;
}

export function createInitialState(
  scenario: Scenario,
  rng: Rng = Math.random
): LessonState {
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
 * Apply a Director output to the lesson state. Every delta is a proposal:
 * completions are idempotent (done -> no-op), run-ahead proposals are buffered
 * (defer-don't-drop), and slot writes are provenance-gated. The reducer is the
 * sole authority on committed state.
 */
export function reduce(
  state: LessonState,
  scenario: Scenario,
  output: DirectorOutput,
  rng: Rng = Math.random
): LessonState {
  const defs = milestoneMap(scenario);
  const statuses: Record<MilestoneId, MilestoneStatus> = { ...state.milestones };
  const slots = { ...state.slots };
  const worldFacts = { ...state.worldFacts };
  const attempts = { ...state.attempts };
  const activeFrictions = [...state.activeFrictions];
  const resolvedFrictions = [...state.resolvedFrictions];
  const pendingCompletions = [...state.pendingCompletions];

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
  let status: LessonState['status'];
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
