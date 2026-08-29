import { describe, it, expect } from 'vitest';
import { judgeEvaluationSchema, judgeFindingSchema } from '$lib/trace/types';

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
