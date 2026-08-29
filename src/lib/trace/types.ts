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

/**
 * OpenInference / OpenTelemetry aligned LLM call trace
 */
export interface LLMCallTrace<TInput, TOutput> {
  traceId: string;
  spanId: string;
  model: string;
  durationMs: number;
  tokens?: LLMUsage;
  systemPrompt?: string;
  prompt?: string;
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
