import { z } from 'zod';
import type { ActorAgentInput, ActorOutput } from '$lib/ai/schema';
import type { DirectorAgentInput } from '$lib/ai/director';
import type { DirectorOutput, LessonState } from '$lib/scenario/state';
import type { Scenario } from '$lib/scenario/scenario';

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface UsageLike {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export function normalizeUsage(usage: unknown): LLMUsage {
  const u = usage as UsageLike | undefined;
  const promptTokens = u?.promptTokens ?? u?.inputTokens ?? 0;
  const completionTokens = u?.completionTokens ?? u?.outputTokens ?? 0;
  const totalTokens = u?.totalTokens ?? (promptTokens + completionTokens);
  return { promptTokens, completionTokens, totalTokens };
}

/**
 * Standard telemetry context passed along with agent requests from the client
 */
export interface TraceRequestMeta {
  sessionId?: string;
  turnIndex?: number;
}

export type WithTraceMeta<T> = T & TraceRequestMeta;

export interface TraceMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * OpenInference / OpenTelemetry aligned LLM call trace
 */
export interface LLMCallTrace<TInput, TOutput> {
  traceId: string;
  spanId: string;
  model: string;
  durationMs: number;
  tokens?: LLMUsage;
  messages: Array<TraceMessage>;
  input: TInput;
  output: TOutput;
  rawOutput?: string;
}

export interface TraceEvent {
  type: string;
  timestamp: string;
  message: string;
  payload?: unknown;
}

export interface TurnTrace {
  turnIndex: number;
  timestamp: string;
  studentInput: string;
  dialogueHistorySnapshot: string;
  preState?: LessonState;
  director?: LLMCallTrace<DirectorAgentInput, DirectorOutput>;
  reducedState?: LessonState;
  actor?: LLMCallTrace<ActorAgentInput, ActorOutput>;
  events: TraceEvent[];
}

export interface SessionTraceSummary {
  totalTurns: number;
  completedMilestones: string[];
  uncompletedMilestones: string[];
  filledSlots: Record<string, unknown>;
  totalDirectorCalls: number;
  totalActorCalls: number;
  totalTokens: LLMUsage;
  durationSeconds: number;
}

export interface SessionTrace {
  sessionId: string;
  scenarioId: string;
  language: string;
  goal: string;
  startedAt: string;
  updatedAt: string;
  scenario: Scenario;
  initialState: LessonState;
  turns: TurnTrace[];
  finalState?: LessonState;
  status: 'in_progress' | 'won' | 'timed_out' | 'aborted';
  summary?: SessionTraceSummary;
}

export const traceActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('start'),
    sessionId: z.string().optional(),
    scenario: z.any(),
    initialState: z.any()
  }),
  z.object({
    action: z.literal('reduce'),
    sessionId: z.string(),
    turnIndex: z.number(),
    state: z.any()
  }),
  z.object({
    action: z.literal('finish'),
    sessionId: z.string(),
    status: z.enum(['in_progress', 'won', 'timed_out', 'aborted']),
    finalState: z.any().optional()
  }),
  z.object({
    action: z.literal('event'),
    sessionId: z.string(),
    turnIndex: z.number().optional(),
    event: z.object({
      type: z.string(),
      timestamp: z.string(),
      message: z.string(),
      payload: z.unknown().optional()
    })
  })
]);

export type TraceAction = z.infer<typeof traceActionSchema>;

export const judgeFindingSchema = z.object({
  category: z.enum([
    'naturalness',
    'continuity',
    'sensing_accuracy',
    'pedagogy_and_guidance',
    'technical'
  ]),
  severity: z.enum(['critical', 'warning', 'info']),
  turnIndex: z.number().nullable().describe('Turn index where the issue occurred, or null if general'),
  description: z.string().describe('Clear explanation of what happened'),
  evidence: z.string().nullable().describe('Exact quote or state evidence from the trace'),
  recommendation: z.string().describe('Concrete recommendation for prompt, rubric, or code change')
});

export type JudgeFinding = z.infer<typeof judgeFindingSchema>;

export const judgeEvaluationSchema = z.object({
  overallScore: z.number().min(1).max(10).describe('Overall quality score from 1 (poor) to 10 (flawless)'),
  categoryScores: z.object({
    naturalness: z.number().min(1).max(10).describe('Naturalness, immersion, and idiomacy of NPC responses'),
    continuity: z.number().min(1).max(10).describe('Consistency with world facts, previous turns, and memory'),
    sensingAccuracy: z.number().min(1).max(10).describe('Accuracy of Director milestone sensing & slot filling'),
    pedagogicalGuidance: z.number().min(1).max(10).describe('Effectiveness of stage directions in guiding without spoiling')
  }),
  summary: z.string().describe('High-level executive summary of the evaluation'),
  milestoneAnalysis: z.string().describe('Evaluation of how milestones were unlocked, tackled, and completed'),
  findings: z.array(judgeFindingSchema).describe('Specific observations, issues, and actionable suggestions'),
  promptRecommendations: z.array(
    z.object({
      target: z.enum(['director_prompt', 'actor_prompt', 'teacher_prompt', 'scenario_rubric', 'reducer_logic']),
      currentBehavior: z.string(),
      recommendedChange: z.string()
    })
  ).describe('Concrete improvements to prompts and scenario rubrics')
});

export type JudgeEvaluation = z.infer<typeof judgeEvaluationSchema>;

export interface JudgeReport extends JudgeEvaluation {
  sessionId: string;
  evaluatedAt: string;
  markdownReport: string;
}
