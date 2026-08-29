import { describe, it, expect, beforeEach } from 'vitest';
import { TraceStore } from './traceStore';
import type { Scenario } from '$lib/scenario/scenario';
import type { LessonState } from '$lib/scenario/state';
import type { DirectorAgentInput } from '$lib/ai/director';
import type { ActorAgentInput } from '$lib/ai/schema';

const mockScenario: Scenario = {
  id: 'test-scenario',
  language: 'French',
  setting: {
    slugline: 'INT. BISTRO - DAY',
    description: 'A quiet bistro'
  },
  goal: 'Order a coffee',
  slack: 1.5,
  characters: {
    waiter: {
      id: 'waiter',
      actor: 'assistant',
      role: { name: 'Waiter', description: 'bistro waiter', gender: 'male' },
      avatarUrl: ''
    },
    student: {
      id: 'student',
      actor: 'user',
      role: { name: 'Student', description: 'tourist', gender: 'diverse' },
      avatarUrl: ''
    }
  },
  playerCharacterId: 'student',
  npcCharacterId: 'waiter',
  milestones: [
    {
      id: 'greet',
      objective: 'Greet',
      kind: 'student',
      prerequisites: [],
      rubric: 'Say bonjour',
      fillsSlots: [],
      optional: false
    },
    {
      id: 'order',
      objective: 'Order coffee',
      kind: 'student',
      prerequisites: ['greet'],
      rubric: 'Order coffee',
      fillsSlots: ['drink'],
      optional: false
    }
  ],
  slots: [
    { id: 'drink', description: 'desired drink' }
  ],
  frictions: [],
  variableSpec: {}
};

const mockInitialState: LessonState = {
  scenarioId: 'test-scenario',
  turn: 1,
  maxTurns: 10,
  variables: {},
  milestones: { greet: 'active', order: 'locked' },
  slots: {},
  worldFacts: {},
  activeFrictions: [],
  resolvedFrictions: [],
  focusMilestoneId: 'greet',
  attempts: { greet: 0, order: 0 },
  pendingCompletions: [],
  offTopicStreak: 0,
  mode: 'advance',
  pendingNpcAction: null,
  status: 'in_progress'
};

describe('TraceStore', () => {
  let store: TraceStore;

  beforeEach(() => {
    store = new TraceStore();
  });

  it('starts a new session with proper initialization', () => {
    const sessionId = `test-${Date.now()}`;
    const session = store.startSession(mockScenario, mockInitialState, sessionId);

    expect(session.sessionId).toBe(sessionId);
    expect(session.status).toBe('in_progress');
    expect(session.turns).toEqual([]);
    expect(session.summary?.uncompletedMilestones).toEqual(['greet', 'order']);
    expect(session.summary?.totalTurns).toBe(0);

    const fetched = store.getSession(sessionId);
    expect(fetched).toBeDefined();
    expect(fetched?.sessionId).toBe(sessionId);
  });

  it('records turn progression through director, reducer, and actor', () => {
    const sessionId = `test-turns-${Date.now()}`;
    store.startSession(mockScenario, mockInitialState, sessionId);

    // 1. Director call
    store.recordDirectorCall(
      sessionId,
      1,
      {
        traceId: 'trace-1',
        spanId: 'span-dir-1',
        model: 'gpt-4o-mini',
        durationMs: 450,
        tokens: { promptTokens: 120, completionTokens: 40, totalTokens: 160 },
        systemPrompt: 'System instruction...',
        prompt: 'User prompt...',
        input: {} as unknown as DirectorAgentInput,
        output: {
          agent: 'director',
          observedDeltas: { completedMilestones: ['greet'], filledSlots: [], resolvedFrictions: [], offTopic: false },
          stageDirections: ['Greet guest warmly'],
          worldFactUpdates: [],
          storyComplete: false
        }
      },
      {
        studentInput: 'Bonjour!',
        dialogueHistorySnapshot: 'Student: Bonjour!'
      }
    );

    let session = store.getSession(sessionId)!;
    expect(session.turns.length).toBe(1);
    const turn1 = session.turns[0]!;
    expect(turn1.turnIndex).toBe(1);
    expect(turn1.studentInput).toBe('Bonjour!');
    expect(turn1.director?.tokens?.totalTokens).toBe(160);

    // 2. Reducer state
    const reducedState: LessonState = {
      ...mockInitialState,
      turn: 2,
      milestones: { greet: 'done', order: 'active' },
      focusMilestoneId: 'order'
    };
    store.recordReducedState(sessionId, 1, reducedState);

    session = store.getSession(sessionId)!;
    expect(session.turns[0]!.reducedState?.milestones.greet).toBe('done');
    expect(session.summary?.completedMilestones).toContain('greet');

    // 3. Actor call
    store.recordActorCall(sessionId, 1, {
      traceId: 'trace-1',
      spanId: 'span-act-1',
      model: 'gpt-4o-mini',
      durationMs: 320,
      tokens: { promptTokens: 80, completionTokens: 25, totalTokens: 105 },
      systemPrompt: 'Actor system prompt',
      prompt: 'Actor prompt',
      input: {} as unknown as ActorAgentInput,
      output: {
        agent: 'actor',
        text: 'Bonjour! Bienvenue au bistro.',
        action: null
      }
    });

    session = store.getSession(sessionId)!;
    expect(session.turns[0]!.actor?.output.text).toBe('Bonjour! Bienvenue au bistro.');
    expect(session.summary?.totalDirectorCalls).toBe(1);
    expect(session.summary?.totalActorCalls).toBe(1);
    expect(session.summary?.totalTokens.totalTokens).toBe(265);
  });

  it('finalizes a session and compiles summary metrics', () => {
    const sessionId = `test-finish-${Date.now()}`;
    store.startSession(mockScenario, mockInitialState, sessionId);

    const finalState: LessonState = {
      ...mockInitialState,
      status: 'won',
      milestones: { greet: 'done', order: 'done' },
      slots: { drink: { value: 'un café', turn: 2 } }
    };

    const finished = store.finishSession(sessionId, 'won', finalState);
    expect(finished).toBeDefined();
    expect(finished?.status).toBe('won');
    expect(finished?.summary?.completedMilestones).toEqual(['greet', 'order']);
    expect(finished?.summary?.uncompletedMilestones).toEqual([]);
    expect(finished?.summary?.filledSlots).toEqual({ drink: 'un café' });
  });
});
