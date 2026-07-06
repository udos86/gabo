import { describe, expect, it } from 'vitest';

import { deriveMaxTurns, scenarioSchema, type Scenario } from './scenario';
import { createInitialState, reduce } from './reducer';
import type { DirectorOutput } from './state';

function buildScenario(overrides: Partial<Scenario> = {}): Scenario {
  return scenarioSchema.parse({
    id: 'cafe',
    language: 'French',
    setting: { slugline: 'INT. CAFÉ - MORNING', description: 'A busy Parisian café.' },
    goal: 'Get seated and order something to eat and drink.',
    slack: 1.5,
    characters: {
      waiter: {
        id: 'waiter',
        actor: 'assistant',
        role: { name: 'Waiter', description: 'a professional waiter', gender: 'male' },
        avatarUrl: '/waiter.png'
      },
      tourist: {
        id: 'tourist',
        actor: 'user',
        role: { name: 'Tourist', description: 'a shy tourist', gender: 'male' },
        avatarUrl: '/tourist.png'
      }
    },
    playerCharacterId: 'tourist',
    npcCharacterId: 'waiter',
    milestones: [
      { id: 'greet', objective: 'greet the waiter', kind: 'student', rubric: 'says a greeting' },
      {
        id: 'ask_table',
        objective: 'ask for a table',
        kind: 'student',
        prerequisites: ['greet'],
        rubric: 'asks for a table',
        fillsSlots: ['party_size']
      },
      {
        id: 'order',
        objective: 'order food and drink',
        kind: 'student',
        prerequisites: ['ask_table'],
        rubric: 'orders something'
      }
    ],
    slots: [{ id: 'party_size', description: 'number of guests' }],
    frictions: [],
    variableSpec: {},
    ...overrides
  });
}

function emptyOutput(overrides: Partial<DirectorOutput> = {}): DirectorOutput {
  return {
    agent: 'director',
    observedDeltas: {
      completedMilestones: [],
      filledSlots: [],
      resolvedFrictions: [],
      offTopic: false,
      ...overrides.observedDeltas
    },
    stageDirections: [],
    worldFactUpdates: [],
    storyComplete: false,
    ...overrides
  };
}

const rng = () => 0; // deterministic: friction with p>0 always fires, p=0 never

describe('createInitialState', () => {
  it('locks all milestones except the prerequisite-free focus, which becomes active', () => {
    const state = createInitialState(buildScenario(), rng);
    expect(state.milestones.greet).toBe('active');
    expect(state.milestones.ask_table).toBe('locked');
    expect(state.milestones.order).toBe('locked');
    expect(state.focusMilestoneId).toBe('greet');
    expect(state.status).toBe('in_progress');
  });

  it('rolls one value per variable spec key', () => {
    const scenario = buildScenario({ variableSpec: { mood: ['grumpy', 'cheerful'] } });
    const state = createInitialState(scenario, () => 0.99);
    expect(state.variables.mood).toBe('cheerful');
  });
});

describe('reduce — milestone completion', () => {
  it('completes an eligible milestone and unlocks its dependents', () => {
    const state = createInitialState(buildScenario(), rng);
    const next = reduce(state, buildScenario(), emptyOutput({
      observedDeltas: { completedMilestones: ['greet'], filledSlots: [], resolvedFrictions: [], offTopic: false }
    }), rng);
    expect(next.milestones.greet).toBe('done');
    expect(next.milestones.ask_table).toBe('active'); // eligible then selected as focus
    expect(next.focusMilestoneId).toBe('ask_table');
  });

  it('is idempotent: re-completing a done milestone is a no-op (state-drift defense)', () => {
    const scenario = buildScenario();
    let state = createInitialState(scenario, rng);
    state = reduce(state, scenario, emptyOutput({
      observedDeltas: { completedMilestones: ['greet'], filledSlots: [], resolvedFrictions: [], offTopic: false }
    }), rng);
    const before = state.milestones.greet;
    const next = reduce(state, scenario, emptyOutput({
      observedDeltas: { completedMilestones: ['greet'], filledSlots: [], resolvedFrictions: [], offTopic: false }
    }), rng);
    expect(before).toBe('done');
    expect(next.milestones.greet).toBe('done');
    expect(next.pendingCompletions).toHaveLength(0);
  });

  it('buffers a run-ahead completion and auto-commits it once prereqs clear (defer-don\'t-drop)', () => {
    const scenario = buildScenario();
    const state = createInitialState(scenario, rng);
    // Student blurts the order before greeting/asking: order's prereqs are unmet.
    const buffered = reduce(state, scenario, emptyOutput({
      observedDeltas: { completedMilestones: ['order'], filledSlots: [], resolvedFrictions: [], offTopic: false }
    }), rng);
    expect(buffered.milestones.order).not.toBe('done');
    expect(buffered.pendingCompletions).toContain('order');

    // Now complete greet, then ask_table — buffered order should auto-commit.
    const afterGreet = reduce(buffered, scenario, emptyOutput({
      observedDeltas: { completedMilestones: ['greet'], filledSlots: [], resolvedFrictions: [], offTopic: false }
    }), rng);
    const afterAsk = reduce(afterGreet, scenario, emptyOutput({
      observedDeltas: { completedMilestones: ['ask_table'], filledSlots: [], resolvedFrictions: [], offTopic: false }
    }), rng);
    expect(afterAsk.milestones.order).toBe('done');
    expect(afterAsk.pendingCompletions).not.toContain('order');
    expect(afterAsk.status).toBe('won');
  });

  it('rejects unknown milestone ids', () => {
    const scenario = buildScenario();
    const state = createInitialState(scenario, rng);
    const next = reduce(state, scenario, emptyOutput({
      observedDeltas: { completedMilestones: ['nope'], filledSlots: [], resolvedFrictions: [], offTopic: false }
    }), rng);
    expect(next.pendingCompletions).not.toContain('nope');
  });
});

describe('reduce — slot provenance', () => {
  it('accepts a slot write whose evidenceTurn matches the current turn', () => {
    const scenario = buildScenario();
    const state = createInitialState(scenario, rng); // turn === 1
    const next = reduce(state, scenario, emptyOutput({
      observedDeltas: {
        completedMilestones: [],
        filledSlots: [{ slotId: 'party_size', value: '1', evidenceTurn: 1 }],
        resolvedFrictions: [],
        offTopic: false
      }
    }), rng);
    expect(next.slots.party_size).toEqual({ value: '1', turn: 1 });
  });

  it('rejects a stale/hallucinated slot write (value-drift defense)', () => {
    const scenario = buildScenario();
    const state = createInitialState(scenario, rng); // turn === 1
    const next = reduce(state, scenario, emptyOutput({
      observedDeltas: {
        completedMilestones: [],
        filledSlots: [{ slotId: 'party_size', value: '99', evidenceTurn: 0 }],
        resolvedFrictions: [],
        offTopic: false
      }
    }), rng);
    expect(next.slots.party_size).toBeUndefined();
  });

  it('rejects a slot write with an unknown slot id (id-validation defense)', () => {
    const scenario = buildScenario();
    const state = createInitialState(scenario, rng); // turn === 1
    const next = reduce(state, scenario, emptyOutput({
      observedDeltas: {
        completedMilestones: [],
        filledSlots: [{ slotId: 'partySize', value: '2', evidenceTurn: 1 }],
        resolvedFrictions: [],
        offTopic: false
      }
    }), rng);
    expect(next.slots.partySize).toBeUndefined();
    expect(next.slots.party_size).toBeUndefined();
  });
});

describe('reduce — mode selection', () => {
  it('enters deflect mode on off-topic and escalates the streak', () => {
    const scenario = buildScenario();
    const state = createInitialState(scenario, rng);
    const first = reduce(state, scenario, emptyOutput({
      observedDeltas: { completedMilestones: [], filledSlots: [], resolvedFrictions: [], offTopic: true }
    }), rng);
    expect(first.mode).toBe('deflect');
    expect(first.offTopicStreak).toBe(1);
    const second = reduce(first, scenario, emptyOutput({
      observedDeltas: { completedMilestones: [], filledSlots: [], resolvedFrictions: [], offTopic: true }
    }), rng);
    expect(second.offTopicStreak).toBe(2);
  });

  it('enters repair mode after repeated failed attempts on the focus milestone', () => {
    const scenario = buildScenario();
    let state = createInitialState(scenario, rng);
    // Two turns without completing greet -> attempts reach threshold.
    state = reduce(state, scenario, emptyOutput(), rng);
    state = reduce(state, scenario, emptyOutput(), rng);
    expect(state.mode).toBe('repair');
  });
});

describe('reduce — win and timeout', () => {
  it('wins when all mandatory milestones are done', () => {
    const scenario = buildScenario();
    let state = createInitialState(scenario, rng);
    for (const id of ['greet', 'ask_table', 'order']) {
      state = reduce(state, scenario, emptyOutput({
        observedDeltas: { completedMilestones: [id], filledSlots: [], resolvedFrictions: [], offTopic: false }
      }), rng);
    }
    expect(state.status).toBe('won');
  });

  it('optional milestones do not affect the win condition', () => {
    const scenario = buildScenario({
      milestones: [
        { id: 'greet', objective: 'greet', kind: 'student', prerequisites: [], rubric: 'r', fillsSlots: [], optional: false },
        { id: 'smalltalk', objective: 'chat about weather', kind: 'student', prerequisites: [], rubric: 'r', fillsSlots: [], optional: true }
      ]
    });
    let state = createInitialState(scenario, rng);
    state = reduce(state, scenario, emptyOutput({
      observedDeltas: { completedMilestones: ['greet'], filledSlots: [], resolvedFrictions: [], offTopic: false }
    }), rng);
    expect(state.status).toBe('won');
    expect(state.milestones.smalltalk).not.toBe('done');
  });

  it('times out when the turn budget is exceeded without completion', () => {
    const scenario = buildScenario({ slack: 1 });
    let state = createInitialState(scenario, rng);
    const budget = state.maxTurns;
    for (let i = 0; i < budget + 1; i++) state = reduce(state, scenario, emptyOutput(), rng);
    expect(state.status).toBe('timed_out');
  });
});

describe('friction', () => {
  it('rolls an attached friction active when its milestone becomes eligible', () => {
    const scenario = buildScenario({
      frictions: [
        {
          id: 'terrace_full',
          attachesTo: 'ask_table',
          description: 'the terrace is full',
          extraObjective: 'accept a table inside instead',
          rubric: 'accepts an alternative',
          probability: 1,
          avgTurnCost: 2
        }
      ]
    });
    let state = createInitialState(scenario, rng);
    expect(state.activeFrictions).not.toContain('terrace_full'); // ask_table not eligible yet
    state = reduce(state, scenario, emptyOutput({
      observedDeltas: { completedMilestones: ['greet'], filledSlots: [], resolvedFrictions: [], offTopic: false }
    }), rng);
    expect(state.activeFrictions).toContain('terrace_full');
  });

  it('resolving a friction moves it from active to resolved', () => {
    const scenario = buildScenario({
      frictions: [
        {
          id: 'terrace_full',
          attachesTo: 'greet',
          description: 'the terrace is full',
          extraObjective: 'accept inside',
          rubric: 'accepts',
          probability: 1,
          avgTurnCost: 2
        }
      ]
    });
    let state = createInitialState(scenario, rng);
    expect(state.activeFrictions).toContain('terrace_full');
    state = reduce(state, scenario, emptyOutput({
      observedDeltas: { completedMilestones: [], filledSlots: [], resolvedFrictions: ['terrace_full'], offTopic: false }
    }), rng);
    expect(state.activeFrictions).not.toContain('terrace_full');
    expect(state.resolvedFrictions).toContain('terrace_full');
  });

  it('derives maxTurns from mandatory count plus expected friction cost times slack', () => {
    const scenario = buildScenario({
      slack: 1.5,
      frictions: [
        {
          id: 'f',
          attachesTo: 'ask_table',
          description: 'd',
          extraObjective: 'e',
          rubric: 'r',
          probability: 0.5,
          avgTurnCost: 2
        }
      ]
    });
    // 3 mandatory + 0.5*2 expected friction cost = 4; *1.5 = 6.
    expect(deriveMaxTurns(scenario)).toBe(6);
  });
});
