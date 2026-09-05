import fs from 'node:fs';
import path from 'node:path';
import type { Scenario } from '$lib/scenario/scenario';
import type { LessonState, DirectorOutput } from '$lib/scenario/state';
import type { DirectorAgentInput } from '$lib/ai/director';
import type { ActorAgentInput, ActorOutput } from '$lib/ai/schema';
import { normalizeUsage, type SessionTrace, type TurnTrace, type TraceEvent, type LLMCallTrace, type LLMUsage, type TraceMessage } from '$lib/trace/types';

const TRACES_DIR = path.resolve(process.cwd(), 'traces');

export class TraceStore {
  private activeTraces = new Map<string, SessionTrace>();
  private autoPersistSessions = new Set<string>();
  private tracesDir: string;

  constructor(tracesDir: string = TRACES_DIR) {
    this.tracesDir = tracesDir;
    this.ensureTracesDir();
    this.loadPersistedSessions();
  }

  private ensureTracesDir(): void {
    if (!fs.existsSync(this.tracesDir)) {
      fs.mkdirSync(this.tracesDir, { recursive: true });
    }
  }

  private loadPersistedSessions(): void {
    try {
      if (!fs.existsSync(this.tracesDir)) return;
      const files = fs.readdirSync(this.tracesDir);
      for (const file of files) {
        if (file.endsWith('.json') && !file.startsWith('.')) {
          const filePath = path.join(this.tracesDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const parsed = JSON.parse(content) as SessionTrace;
          if (parsed.sessionId) {
            this.activeTraces.set(parsed.sessionId, parsed);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load existing traces from disk:', err);
    }
  }

  public persistSession(trace: SessionTrace): void {
    try {
      this.ensureTracesDir();
      const filePath = path.join(this.tracesDir, `${trace.sessionId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(trace, null, 2), 'utf-8');
    } catch (err) {
      console.error(`Failed to persist trace for session ${trace.sessionId}:`, err);
    }
  }

  public persistSessionById(sessionId: string): boolean {
    const trace = this.getSession(sessionId);
    if (!trace) return false;
    this.autoPersistSessions.add(sessionId);
    this.persistSession(trace);
    return true;
  }

  public isAutoPersist(sessionId: string): boolean {
    return this.autoPersistSessions.has(sessionId);
  }

  public startSession(
    scenario: Scenario,
    initialState: LessonState,
    sessionId?: string,
    autoPersist = false
  ): SessionTrace {
    const id = sessionId ?? globalThis.crypto.randomUUID();
    const now = new Date().toISOString();

    const trace: SessionTrace = {
      sessionId: id,
      scenarioId: scenario.id,
      language: scenario.language,
      goal: scenario.goal,
      startedAt: now,
      updatedAt: now,
      scenario,
      initialState,
      turns: [],
      status: 'in_progress',
      summary: {
        totalTurns: 0,
        completedMilestones: [],
        uncompletedMilestones: scenario.milestones.map((m) => m.id),
        filledSlots: {},
        totalDirectorCalls: 0,
        totalActorCalls: 0,
        totalTokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        durationSeconds: 0
      }
    };

    this.activeTraces.set(id, trace);
    if (autoPersist) {
      this.autoPersistSessions.add(id);
      this.persistSession(trace);
    }
    return trace;
  }

  public getSession(sessionId: string): SessionTrace | undefined {
    let trace = this.activeTraces.get(sessionId);
    if (!trace) {
      const filePath = path.join(this.tracesDir, `${sessionId}.json`);
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          trace = JSON.parse(content) as SessionTrace;
          this.activeTraces.set(sessionId, trace);
        } catch {
          // ignore corrupted file
        }
      }
    }
    return trace;
  }

  public listSessions(): Array<{
    sessionId: string;
    scenarioId: string;
    language: string;
    startedAt: string;
    updatedAt: string;
    turnsCount: number;
    status: string;
    totalTokens: number;
  }> {
    return Array.from(this.activeTraces.values())
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map((t) => ({
        sessionId: t.sessionId,
        scenarioId: t.scenarioId,
        language: t.language,
        startedAt: t.startedAt,
        updatedAt: t.updatedAt,
        turnsCount: t.turns.length,
        status: t.status,
        totalTokens: t.summary?.totalTokens.totalTokens ?? 0
      }));
  }

  private getOrCreateTurn(trace: SessionTrace, turnIndex: number): TurnTrace {
    let turn = trace.turns.find((t) => t.turnIndex === turnIndex);
    if (!turn) {
      turn = {
        turnIndex,
        timestamp: new Date().toISOString(),
        studentInput: '',
        dialogueHistorySnapshot: '',
        events: []
      };
      trace.turns.push(turn);
      trace.turns.sort((a, b) => a.turnIndex - b.turnIndex);
    }
    return turn;
  }

  private updateTurn(
    sessionId: string,
    turnIndex: number,
    mutate: (turn: TurnTrace, trace: SessionTrace) => void
  ): void {
    const trace = this.getSession(sessionId);
    if (!trace) {
      console.warn(`[TraceStore] Session not found: ${sessionId}`);
      return;
    }

    const turn = this.getOrCreateTurn(trace, turnIndex);
    mutate(turn, trace);
    trace.updatedAt = new Date().toISOString();
    this.updateSummaryMetrics(trace);
    if (this.autoPersistSessions.has(sessionId)) {
      this.persistSession(trace);
    }
  }

  public recordDirectorCall(
    sessionId: string,
    turnIndex: number,
    call: LLMCallTrace<DirectorAgentInput, DirectorOutput>,
    meta?: {
      studentInput?: string;
      dialogueHistorySnapshot?: string;
      preState?: LessonState;
    }
  ): void {
    this.updateTurn(sessionId, turnIndex, (turn) => {
      turn.director = call;
      if (meta?.studentInput !== undefined) turn.studentInput = meta.studentInput;
      if (meta?.dialogueHistorySnapshot !== undefined) turn.dialogueHistorySnapshot = meta.dialogueHistorySnapshot;
      if (meta?.preState !== undefined) turn.preState = meta.preState;
    });
  }

  public recordReducedState(sessionId: string, turnIndex: number, reducedState: LessonState): void {
    this.updateTurn(sessionId, turnIndex, (turn) => {
      turn.reducedState = reducedState;
    });
  }

  public recordActorCall(
    sessionId: string,
    turnIndex: number,
    call: LLMCallTrace<ActorAgentInput, ActorOutput>
  ): void {
    this.updateTurn(sessionId, turnIndex, (turn) => {
      turn.actor = call;
    });
  }

  public recordEvent(sessionId: string, turnIndex: number | undefined, event: TraceEvent): void {
    const trace = this.getSession(sessionId);
    if (!trace) return;

    if (turnIndex !== undefined) {
      const turn = this.getOrCreateTurn(trace, turnIndex);
      turn.events.push(event);
    } else {
      const currentTurn = trace.turns.at(-1) ?? this.getOrCreateTurn(trace, 1);
      currentTurn.events.push(event);
    }

    trace.updatedAt = new Date().toISOString();
    if (this.autoPersistSessions.has(sessionId)) {
      this.persistSession(trace);
    }
  }

  public finishSession(
    sessionId: string,
    status: SessionTrace['status'],
    finalState?: LessonState
  ): SessionTrace | undefined {
    const trace = this.getSession(sessionId);
    if (!trace) return undefined;

    trace.status = status;
    trace.updatedAt = new Date().toISOString();
    if (finalState) trace.finalState = finalState;

    this.updateSummaryMetrics(trace);
    if (this.autoPersistSessions.has(sessionId)) {
      this.persistSession(trace);
    }
    return trace;
  }

  private updateSummaryMetrics(trace: SessionTrace): void {
    const latestState = trace.finalState ?? trace.turns.at(-1)?.reducedState ?? trace.initialState;
    const completedMilestones = Object.entries(latestState.milestones)
      .filter(([mId, status]) => Boolean(mId) && status === 'done')
      .map(([id]) => id);

    const uncompletedMilestones = trace.scenario.milestones
      .map((m) => m.id)
      .filter((id) => !completedMilestones.includes(id));

    const filledSlots: Record<string, unknown> = {};
    for (const [slotId, slotVal] of Object.entries(latestState.slots)) {
      if (slotVal && slotVal.value !== null) {
        filledSlots[slotId] = slotVal.value;
      }
    }

    let totalDirectorCalls = 0;
    let totalActorCalls = 0;
    const totalTokens: LLMUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    const accumulateTokens = (tokens?: LLMUsage) => {
      if (!tokens) return;
      totalTokens.promptTokens += tokens.promptTokens || 0;
      totalTokens.completionTokens += tokens.completionTokens || 0;
      totalTokens.totalTokens += tokens.totalTokens || 0;
    };

    for (const turn of trace.turns) {
      if (turn.director) {
        totalDirectorCalls++;
        accumulateTokens(turn.director.tokens);
      }
      if (turn.actor) {
        totalActorCalls++;
        accumulateTokens(turn.actor.tokens);
      }
    }

    const durationSeconds = Math.max(
      0,
      Math.round((new Date(trace.updatedAt).getTime() - new Date(trace.startedAt).getTime()) / 1000)
    );

    trace.summary = {
      totalTurns: trace.turns.length,
      completedMilestones,
      uncompletedMilestones,
      filledSlots,
      totalDirectorCalls,
      totalActorCalls,
      totalTokens,
      durationSeconds
    };
  }
}

export const traceStore = new TraceStore();

export interface AttachStreamTraceOptions<TInput, TOutput> {
  sessionId?: string;
  turnIndex: number;
  startTime: number;
  model: string;
  messages: Array<TraceMessage>;
  input: TInput;
  result: { text: PromiseLike<string>; usage: PromiseLike<unknown> };
  onRecorded: (call: LLMCallTrace<TInput, TOutput>) => void;
  errorLabel?: string;
}

export function attachStreamTrace<TInput, TOutput>(options: AttachStreamTraceOptions<TInput, TOutput>): void {
  if (!options.sessionId) return;

  const traceId = globalThis.crypto.randomUUID();
  const spanId = globalThis.crypto.randomUUID();

  void Promise.all([options.result.text, options.result.usage])
    .then(([text, usage]) => {
      const durationMs = Date.now() - options.startTime;
      const output = JSON.parse(text) as TOutput;
      const tokens = normalizeUsage(usage);

      options.onRecorded({
        traceId,
        spanId,
        model: options.model,
        durationMs,
        tokens,
        messages: options.messages,
        input: options.input,
        output,
        rawOutput: text
      });
    })
    .catch((err) => {
      console.error(`[${options.errorLabel ?? 'LLM'} Trace Error] Session ${options.sessionId}:`, err);
    });
}
