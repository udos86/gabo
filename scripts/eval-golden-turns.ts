import fs from 'node:fs';
import path from 'node:path';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';

import { buildDirectorInput, buildDirectorMessages } from '#lib/ai/director';
import type { Scenario } from '#lib/scenario/scenario';
import { directorOutputSchema, type DirectorOutput, type LessonState } from '#lib/scenario/state';
import type { SessionTrace } from '#lib/trace/types';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match && match[1]) {
        const key = match[1];
        let val = match[2] || '';
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        process.env[key] = val;
      }
    }
  }
}

loadEnv();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DIRECTOR_MODEL = process.env.DIRECTOR_MODEL || 'gpt-4o-mini';

export interface GoldenTurnExpectation {
  completedMilestonesIncludes?: string[];
  completedMilestonesExcludes?: string[];
  filledSlots?: Record<string, string>;
  stageDirectionsMustNotMatch?: string[];
}

export interface GoldenTurnCase {
  id: string;
  description: string;
  scenarioId: string;
  state: LessonState;
  dialogue: string;
  studentInput: string;
  expect: GoldenTurnExpectation;
}

export function verifyGoldenTurnOutput(
  tc: GoldenTurnCase,
  output: DirectorOutput
): { passed: boolean; failures: string[] } {
  const failures: string[] = [];
  const completed = output.observedDeltas.completedMilestones;
  const filled = output.observedDeltas.filledSlots;
  const directionsText = output.stageDirections.join(' ');

  for (const reqId of tc.expect.completedMilestonesIncludes ?? []) {
    if (!completed.includes(reqId)) {
      failures.push(`Expected completedMilestones to include "${reqId}", got ${JSON.stringify(completed)}`);
    }
  }

  for (const forbiddenId of tc.expect.completedMilestonesExcludes ?? []) {
    if (completed.includes(forbiddenId)) {
      failures.push(`Expected completedMilestones NOT to include "${forbiddenId}", got ${JSON.stringify(completed)}`);
    }
  }

  for (const [slotId, pattern] of Object.entries(tc.expect.filledSlots ?? {})) {
    const matchSlot = filled.find((s) => s.slotId === slotId);
    if (!matchSlot) {
      failures.push(`Expected slot "${slotId}" to be filled, got ${JSON.stringify(filled)}`);
    } else {
      const regex = new RegExp(pattern, 'i');
      if (!regex.test(matchSlot.value)) {
        failures.push(`Expected slot "${slotId}" value to match /${pattern}/i, got "${matchSlot.value}"`);
      }
    }
  }

  for (const forbiddenPattern of tc.expect.stageDirectionsMustNotMatch ?? []) {
    const regex = new RegExp(forbiddenPattern, 'i');
    if (regex.test(directionsText)) {
      failures.push(
        `Expected stageDirections NOT to match /${forbiddenPattern}/i, got ${JSON.stringify(output.stageDirections)}`
      );
    }
  }

  return {
    passed: failures.length === 0,
    failures
  };
}

function extractTurnFromTrace(sessionId: string, turnIndex: number): void {
  const tracePath = path.resolve(process.cwd(), 'traces', sessionId.endsWith('.json') ? sessionId : `${sessionId}.json`);
  if (!fs.existsSync(tracePath)) {
    console.error(`❌ Trace file not found: ${tracePath}`);
    process.exit(1);
  }

  const trace = JSON.parse(fs.readFileSync(tracePath, 'utf-8')) as SessionTrace;
  const turn = trace.turns.find((t) => t.turnIndex === turnIndex);
  if (!turn || !turn.director) {
    console.error(`❌ Turn ${turnIndex} with director call not found in trace ${sessionId}`);
    process.exit(1);
  }

  const prevTurn = trace.turns.find((t) => t.turnIndex === turnIndex - 1);
  const preState = turn.preState ?? prevTurn?.reducedState ?? trace.initialState;
  if (!preState) {
    console.error(`❌ Could not reconstruct pre-turn LessonState for turn ${turnIndex}`);
    process.exit(1);
  }

  const template: GoldenTurnCase = {
    id: `trace-${sessionId.slice(0, 8)}-turn${turnIndex}`,
    description: `Extracted from session ${sessionId} turn ${turnIndex}`,
    scenarioId: trace.scenarioId,
    state: preState,
    dialogue: turn.dialogueHistorySnapshot,
    studentInput: turn.studentInput,
    expect: {
      completedMilestonesIncludes: turn.director.output.observedDeltas.completedMilestones
    }
  };

  console.log(JSON.stringify(template, null, 2));
}

async function runEval() {
  const args = process.argv.slice(2);
  const extractArg = args.find((a) => a.startsWith('--extract='))?.split('=')[1];
  const turnArg = args.find((a) => a.startsWith('--turn='))?.split('=')[1];
  const idFilter = args.find((a) => a.startsWith('--id='))?.split('=')[1];

  if (extractArg && turnArg) {
    extractTurnFromTrace(extractArg, parseInt(turnArg, 10));
    return;
  }

  if (!OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY is missing in environment or .env');
    process.exit(1);
  }

  const goldenPath = path.resolve(process.cwd(), 'src/lib/ai/golden-turns.json');
  const allCases = JSON.parse(fs.readFileSync(goldenPath, 'utf-8')) as GoldenTurnCase[];
  const cases = idFilter ? allCases.filter((c) => c.id.includes(idFilter)) : allCases;

  if (cases.length === 0) {
    console.error(`❌ No golden turns matched filter "${idFilter}"`);
    process.exit(1);
  }

  const scenariosCache = new Map<string, Scenario>();
  const getScenario = (scenarioId: string): Scenario => {
    const cached = scenariosCache.get(scenarioId);
    if (cached) return cached;
    const filePath = path.resolve(process.cwd(), `src/lib/lessons/${scenarioId}.json`);
    const loaded = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Scenario;
    scenariosCache.set(scenarioId, loaded);
    return loaded;
  };

  const openai = createOpenAI({ apiKey: OPENAI_API_KEY });
  const model = openai(DIRECTOR_MODEL);

  console.log(`\n🛡️  Gabo Golden-Turn Regression Suite`);
  console.log(`Model: ${DIRECTOR_MODEL} | Cases: ${cases.length}\n`);

  let passedCount = 0;
  let failedCount = 0;

  for (const tc of cases) {
    const scenario = getScenario(tc.scenarioId);
    const directorInput = buildDirectorInput(scenario, tc.state, tc.dialogue, tc.studentInput);
    const { systemMessage, userMessage } = buildDirectorMessages(directorInput);

    const start = Date.now();
    const { output } = await generateText({
      model,
      temperature: 0,
      system: String(systemMessage.content),
      messages: [userMessage],
      output: Output.object({ schema: directorOutputSchema })
    });
    const durationMs = Date.now() - start;

    const result = verifyGoldenTurnOutput(tc, output);
    if (result.passed) {
      passedCount++;
      console.log(
        `✅ [PASS] ${tc.id} (${durationMs}ms) -> completed: ${JSON.stringify(output.observedDeltas.completedMilestones)}, slots: ${JSON.stringify(output.observedDeltas.filledSlots.map((s) => `${s.slotId}=${s.value}`))}`
      );
    } else {
      failedCount++;
      console.log(`❌ [FAIL] ${tc.id} (${durationMs}ms)`);
      console.log(`   Description: ${tc.description}`);
      console.log(`   Student Input: "${tc.studentInput}"`);
      for (const f of result.failures) {
        console.log(`   ↳ ${f}`);
      }
      console.log(`   Stage Directions: ${JSON.stringify(output.stageDirections)}`);
    }
  }

  console.log(`\n============================================================`);
  console.log(`📊 Summary: ${passedCount}/${cases.length} passed, ${failedCount} failed`);
  console.log(`============================================================\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  (process.argv[1].endsWith('eval-golden-turns.ts') || process.argv[1].endsWith('eval-golden-turns.js'))
) {
  void runEval();
}
