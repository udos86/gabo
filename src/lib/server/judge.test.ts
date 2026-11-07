import { describe, it, expect } from 'vitest';
import { judgeEvaluationSchema, judgeFindingSchema, type SessionTrace } from '#lib/trace/types';
import { detectTraceInvariantViolations, mergeInvariantAndLlmEvaluation } from '#lib/server/judgeCore';
import cafeRaw from '#lib/lessons/cafe-001.json';
import { scenarioSchema } from '#lib/scenario/scenario';
import { createInitialState } from '#lib/scenario/reducer';

const cafeScenario = scenarioSchema.parse(cafeRaw);

function buildMockTrace(overrides: Partial<SessionTrace> = {}): SessionTrace {
  const initialState = createInitialState(cafeScenario, () => 0.9); // no friction initially
  return {
    sessionId: 'test-session',
    scenarioId: 'cafe-001',
    language: 'French',
    goal: cafeScenario.goal,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    scenario: cafeScenario,
    initialState,
    turns: [],
    status: 'in_progress',
    ...overrides
  };
}

describe('Judge Evaluation Schemas', () => {
  it('validates a correct judge finding', () => {
    const finding = {
      category: 'continuity' as const,
      severity: 'warning' as const,
      turnIndex: 3,
      description: 'Waiter greeted the student a second time',
      evidence: 'Bonjour! Comment puis-je vous aider?',
      recommendation: 'Ensure Actor prompt forbids repeating greetings after Turn 1'
    };

    const parsed = judgeFindingSchema.safeParse(finding);
    expect(parsed.success).toBe(true);
  });

  it('validates a complete judge evaluation report structure', () => {
    const evaluation = {
      overallScore: 8.5,
      categoryScores: {
        naturalness: 9,
        continuity: 8,
        sensingAccuracy: 9,
        pedagogicalGuidance: 8
      },
      summary: 'The session proceeded smoothly with strong conversational immersion.',
      milestoneAnalysis: 'All 4 milestones were completed in logical sequence.',
      findings: [
        {
          category: 'pedagogy_and_guidance' as const,
          severity: 'info' as const,
          turnIndex: 2,
          description: 'Stage direction nudged the student well',
          evidence: null,
          recommendation: 'Keep this stage direction style'
        }
      ],
      promptRecommendations: [
        {
          target: 'director_prompt' as const,
          currentBehavior: 'Sensed table size accurately',
          recommendedChange: 'No change needed'
        }
      ]
    };

    const parsed = judgeEvaluationSchema.safeParse(evaluation);
    expect(parsed.success).toBe(true);
  });

  it('rejects scores outside 1-10 range', () => {
    const invalidEvaluation = {
      overallScore: 11,
      categoryScores: {
        naturalness: 9,
        continuity: 8,
        sensingAccuracy: 9,
        pedagogicalGuidance: 8
      },
      summary: 'Summary',
      milestoneAnalysis: 'Analysis',
      findings: [],
      promptRecommendations: []
    };

    const parsed = judgeEvaluationSchema.safeParse(invalidEvaluation);
    expect(parsed.success).toBe(false);
  });
});

describe('Deterministic Trace Invariant Detector', () => {
  it('detects Slot-Milestone Desync when party_size is filled without completing request_table', () => {
    const trace = buildMockTrace();
    trace.turns = [
      {
        turnIndex: 2,
        timestamp: new Date().toISOString(),
        studentInput: 'Bonjour Monsieur, auriez vous une table pour une personne?',
        dialogueHistorySnapshot: '',
        preState: trace.initialState,
        events: [],
        director: {
          traceId: 't1',
          spanId: 's1',
          model: 'gpt-4o-mini',
          durationMs: 1000,
          messages: [],
          input: {} as never,
          output: {
            agent: 'director',
            observedDeltas: {
              completedMilestones: ['greet'],
              filledSlots: [{ slotId: 'party_size', value: '1', evidenceTurn: 2 }],
              resolvedFrictions: [],
              offTopic: false
            },
            stageDirections: ['Lead the guest inside.'],
            worldFactUpdates: [],
            storyComplete: false
          }
        }
      }
    ];

    const findings = detectTraceInvariantViolations(trace);
    expect(findings.some((f) => f.description.includes('Slot-Milestone Desync'))).toBe(true);
  });

  it('detects Sensing-Authoring Split-Brain when menu is presented before choose_location is done', () => {
    const trace = buildMockTrace();
    const postState = {
      ...trace.initialState,
      milestones: {
        ...trace.initialState.milestones,
        greet: 'done' as const,
        request_table: 'done' as const,
        choose_location: 'active' as const
      }
    };

    trace.turns = [
      {
        turnIndex: 5,
        timestamp: new Date().toISOString(),
        studentInput: "Ce n'est pas mal.",
        dialogueHistorySnapshot: '',
        preState: postState,
        reducedState: postState,
        events: [],
        director: {
          traceId: 't1',
          spanId: 's1',
          model: 'gpt-4o-mini',
          durationMs: 1000,
          messages: [],
          input: {} as never,
          output: {
            agent: 'director',
            observedDeltas: {
              completedMilestones: [],
              filledSlots: [],
              resolvedFrictions: [],
              offTopic: false
            },
            stageDirections: ['Lead the tourist to the table inside and present the menu again.'],
            worldFactUpdates: [],
            storyComplete: false
          }
        }
      }
    ];

    const findings = detectTraceInvariantViolations(trace);
    expect(findings.some((f) => f.description.includes('Sensing-Authoring Split-Brain'))).toBe(true);
  });

  it('caps sensingAccuracy score when critical deterministic sensing findings exist', () => {
    const merged = mergeInvariantAndLlmEvaluation(
      [
        {
          category: 'sensing_accuracy',
          severity: 'critical',
          turnIndex: 2,
          description: 'Slot-Milestone Desync',
          evidence: 'party_size=1',
          recommendation: 'Fix sensing'
        }
      ],
      {
        overallScore: 9,
        categoryScores: {
          naturalness: 9,
          continuity: 9,
          sensingAccuracy: 9,
          pedagogicalGuidance: 9
        },
        summary: 'Great run',
        milestoneAnalysis: 'All good',
        findings: [],
        promptRecommendations: []
      }
    );

    expect(merged.categoryScores.sensingAccuracy).toBeLessThanOrEqual(5);
    expect(merged.overallScore).toBeLessThanOrEqual(8);
    expect(merged.findings).toHaveLength(1);
  });
});
