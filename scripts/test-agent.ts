import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';

import { buildActorMessages } from '#lib/ai/actor';
import { buildDirectorInput, buildDirectorMessages } from '#lib/ai/director';
import { actorOutputSchema } from '#lib/ai/schema';
import { createInitialState, createSessionRng, reduce } from '#lib/scenario/reducer';
import { scenarioSchema } from '#lib/scenario/scenario';
import { directorOutputSchema } from '#lib/scenario/state';
import { detectTraceInvariantViolations, evaluateSessionCore } from '#lib/server/judgeCore';
import { normalizeUsage, type JudgeReport, type SessionTrace, type TurnTrace } from '#lib/trace/types';

// Load .env manually if needed
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

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const DIRECTOR_MODEL = process.env.DIRECTOR_MODEL || 'gpt-4o-mini';
const ACTOR_MODEL = process.env.ACTOR_MODEL || 'gpt-4o-mini';
const STUDENT_MODEL = process.env.STUDENT_MODEL || ACTOR_MODEL || 'gpt-4o-mini';

// Parse command line args
const args = process.argv.slice(2);
let persona = 'polite';
let shouldJudge = false;
let frictionMode: string | null = null;
let seed: string | null = null;

for (const arg of args) {
  if (arg.startsWith('--persona=')) {
    const p = arg.split('=')[1];
    if (p) persona = p;
  } else if (arg.startsWith('--friction=')) {
    frictionMode = arg.split('=')[1] ?? null;
  } else if (arg.startsWith('--seed=')) {
    seed = arg.split('=')[1] ?? null;
  } else if (arg === '--judge') {
    shouldJudge = true;
  } else if (arg === '--no-judge') {
    shouldJudge = false;
  }
}

// Default deterministic friction behavior for friction/twist personas unless explicitly overridden
if (frictionMode === null && (persona === 'friction' || persona === 'twist')) {
  frictionMode = 'on';
}

const openai = createOpenAI({ apiKey: OPENAI_API_KEY });

function getPersonaInstructions(personaType: string): string {
  switch (personaType) {
    case 'twist':
      return `
You are playing a realistic, slightly indecisive tourist in a Parisian café (A2-B1 level).
- In your first response (Turn 2), greet the waiter and ask for a table for one person without specifying inside or outside ("Bonjour Monsieur, auriez-vous une table pour une personne ?").
- In your second response (Turn 3), when the waiter invites you to follow him inside or to your table, ask if you can switch to a table outside on the terrace instead ("Serait-ce possible d'échanger la table ? Je voudrais une table à l'extérieur.").
- Once the waiter informs you that the outdoor terrace is full and suggests staying inside, accept using a brief colloquial expression ("Ce n'est pas mal, d'accord." or "Ce n'est pas mal.").
- Once the waiter seats you and presents the menu, thank him and order a drink (un café au lait) and a pastry (un croissant).
`;
    case 'fast_track':
      return `
You are an enthusiastic, fluent tourist in a Parisian café who combines multiple conversational steps at once.
- In your very first response, greet the waiter, make a brief remark about the lovely autumn morning weather, AND ask for a table for one person inside (e.g. "Bonjour monsieur ! Il fait un temps superbe ce matin, auriez-vous une table pour une personne à l'intérieur ?").
- As soon as the waiter seats you and hands you the menu, thank him and immediately order a café au lait and a croissant in the same turn.
`;
    case 'friction':
      return `
You are playing the role of a slightly demanding or curious tourist in a Parisian café.
- You prefer strongly to sit outside on the terrace. If the waiter says the terrace is full or raining, initially express mild disappointment or ask if there's any small table outside, before eventually accepting an inside table.
- Ask questions about the menu before ordering.
- Order a café and something to eat.
- Language: French (A2-B1 level). Polite but test boundaries.
`;
    case 'terse':
      return `
You are a beginner foreign tourist with limited French (A1 level).
- You speak in very short phrases or simple words (e.g. "Bonjour, une table pour un", "Dedans s'il vous plaît", "Un café au lait et un croissant").
- You do not use complex subordinate clauses.
- You answer directly without elaboration.
`;
    case 'polite':
    default:
      return `
You are playing the role of a polite foreign tourist in a Parisian café practicing French (A2-B1 level).
Your overarching goal:
1. Greet the waiter and ask for a table for one person.
2. Choose where to sit (you prefer inside, or if offered outside but informed the terrace is full, graciously accept inside).
3. Acknowledge being seated and receive the menu.
4. Order a drink (e.g. café au lait or un café) and a food item (e.g. un croissant or pain au chocolat).
5. Optional: make brief polite small talk if appropriate.
`;
  }
}

async function generateStudentResponse({
  latestWaiterLine,
  dialogueHistory,
  turnNumber,
  personaType
}: {
  latestWaiterLine: string;
  dialogueHistory: string;
  turnNumber: number;
  personaType: string;
}): Promise<string> {
  const personaInstructions = getPersonaInstructions(personaType);

  const system = `
You are an autonomous student actor in a language learning roleplay simulation.
${personaInstructions}

RULES FOR YOUR REACTION:
- You must REACT DIRECTLY and naturally to what the waiter just said or asked.
- Follow your persona's turn-by-turn plan carefully.
- Speak in natural French matching your learner persona.
- Output ONLY your spoken French line. No quotes, no stage directions, no English explanations.
`;

  const { text } = await generateText({
    model: openai(STUDENT_MODEL),
    system,
    prompt: `
Turn number: ${turnNumber}

Full dialogue history so far:
${dialogueHistory || '(none)'}

Latest statement/question from the waiter:
"${latestWaiterLine}"

What do you reply next as the tourist? Provide only the spoken French sentence.`
  });

  return text.trim().replace(/^["']|["']$/g, '');
}

function printJudgeReport(sessionId: string, report: JudgeReport) {
  console.log(`\n============================================================`);
  console.log(`🏆 GABO SESSION EVALUATION REPORT (DYNAMIC AGENT RUN)`);
  console.log(`============================================================`);
  console.log(`Overall Score: ${report.overallScore} / 10`);
  console.log(`- Naturalness & Immersion:  ${report.categoryScores.naturalness} / 10`);
  console.log(`- Continuity & Consistency: ${report.categoryScores.continuity} / 10`);
  console.log(`- Sensing Accuracy:         ${report.categoryScores.sensingAccuracy} / 10`);
  console.log(`- Pedagogical Guidance:     ${report.categoryScores.pedagogicalGuidance} / 10`);
  console.log(`\nSummary:\n${report.summary}`);
  console.log(`\nMilestone Analysis:\n${report.milestoneAnalysis}`);
  console.log(`\nFindings (${report.findings.length}):`);
  for (const finding of report.findings) {
    console.log(`  [${finding.severity.toUpperCase()}] [${finding.category}] (Turn ${finding.turnIndex ?? 'all'}) ${finding.description}`);
    if (finding.evidence) console.log(`  * Evidence: "${finding.evidence}"`);
    console.log(`  -> Recommendation: ${finding.recommendation}`);
  }
  if (report.promptRecommendations && report.promptRecommendations.length > 0) {
    console.log(`\nPrompt Recommendations (${report.promptRecommendations.length}):`);
    for (const rec of report.promptRecommendations) {
      console.log(`  [${rec.target}]`);
      console.log(`  - Current: ${rec.currentBehavior}`);
      console.log(`  - Change:  ${rec.recommendedChange}`);
    }
  }
  console.log(`\n📄 Complete Markdown Report saved to: traces/report_${sessionId}.md`);
  console.log(`💾 Raw Telemetry Trace saved to:       traces/${sessionId}.json`);
  console.log(`============================================================\n`);
}

async function runSimulation() {
  if (!OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY is missing in environment or .env');
    process.exit(1);
  }

  const rawScenario = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'src/lib/lessons/cafe-001.json'), 'utf-8')
  );
  const scenario = scenarioSchema.parse(rawScenario);
  const sessionRng = createSessionRng({ seed, friction: frictionMode });
  const initialState = createInitialState(scenario, sessionRng);
  let lessonState = structuredClone(initialState);

  const sessionId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const turns: TurnTrace[] = [];
  const dialogueLines: string[] = [];

  const npc = scenario.characters[scenario.npcCharacterId]!;
  const interlocutors = Object.values(scenario.characters)
    .filter((c) => c.id !== scenario.npcCharacterId)
    .map((c) => c.role);

  console.log(`\n🤖 Launching Autonomous Dynamic Student Test Agent (Direct Engine Mode)...`);
  console.log(`Session ID: ${sessionId}`);
  console.log(`Persona:    ${persona} (friction=${frictionMode ?? 'random'}, seed=${seed ?? 'none'})`);
  console.log(`Models:     Director=${DIRECTOR_MODEL}, Actor=${ACTOR_MODEL}, Student=${STUDENT_MODEL}\n`);

  const MAX_SIM_TURNS = 7;

  for (let turnIndex = 1; turnIndex <= MAX_SIM_TURNS; turnIndex++) {
    let studentInput = '';
    if (turnIndex > 1) {
      const latestWaiterLine = dialogueLines.at(-1)?.replace(/^Waiter:\s*/, '') ?? '';
      studentInput = await generateStudentResponse({
        latestWaiterLine,
        dialogueHistory: dialogueLines.join('\n'),
        turnNumber: turnIndex,
        personaType: persona
      });
      dialogueLines.push(`Tourist: ${studentInput}`);
      console.log(`🗣️ [Turn ${turnIndex}] Tourist (${persona}): "${studentInput}"`);
    }

    const preState = structuredClone(lessonState);
    const dialogueSnapshot = dialogueLines.join('\n');
    const directorInput = buildDirectorInput(scenario, lessonState, dialogueSnapshot, studentInput);
    const { systemMessage: dirSys, userMessage: dirUser } = buildDirectorMessages(directorInput);

    const dirStart = Date.now();
    const dirRes = await generateText({
      model: openai(DIRECTOR_MODEL),
      temperature: 0,
      system: String(dirSys.content),
      messages: [dirUser],
      output: Output.object({ schema: directorOutputSchema })
    });
    const dirDuration = Date.now() - dirStart;
    const dirOutput = dirRes.output;
    const dirUsage = normalizeUsage(dirRes.usage);

    lessonState = reduce(lessonState, scenario, dirOutput, sessionRng);

    console.log(
      `🎬 [Turn ${turnIndex}] Director (${dirDuration}ms): completed=${JSON.stringify(dirOutput.observedDeltas.completedMilestones)}, slots=${JSON.stringify(dirOutput.observedDeltas.filledSlots.map((s) => `${s.slotId}=${s.value}`))}, nextFocus=${lessonState.focusMilestoneId}, activeFrictions=${JSON.stringify(lessonState.activeFrictions)}`
    );

    const actorInput = {
      language: scenario.language,
      slugline: scenario.setting.slugline,
      role: npc.role,
      stageDirections: dirOutput.stageDirections,
      interlocutors,
      dialogue: dialogueSnapshot,
      worldFacts: lessonState.worldFacts,
      variables: lessonState.variables
    };
    const { systemMessage: actSys, userMessage: actUser } = buildActorMessages(actorInput);

    const actStart = Date.now();
    const actRes = await generateText({
      model: openai(ACTOR_MODEL),
      system: String(actSys.content),
      messages: [actUser],
      output: Output.object({ schema: actorOutputSchema })
    });
    const actDuration = Date.now() - actStart;
    const actOutput = actRes.output;
    const actUsage = normalizeUsage(actRes.usage);

    dialogueLines.push(`Waiter: ${actOutput.text}`);
    console.log(`☕ [Turn ${turnIndex}] Waiter (${actDuration}ms): "${actOutput.text}"\n`);

    turns.push({
      turnIndex,
      timestamp: new Date().toISOString(),
      studentInput,
      dialogueHistorySnapshot: dialogueSnapshot,
      preState,
      director: {
        traceId: crypto.randomUUID(),
        spanId: crypto.randomUUID(),
        model: DIRECTOR_MODEL,
        durationMs: dirDuration,
        tokens: dirUsage,
        messages: [
          { role: 'system', content: String(dirSys.content) },
          { role: 'user', content: String(dirUser.content) }
        ],
        input: directorInput,
        output: dirOutput,
        rawOutput: JSON.stringify(dirOutput)
      },
      reducedState: structuredClone(lessonState),
      actor: {
        traceId: crypto.randomUUID(),
        spanId: crypto.randomUUID(),
        model: ACTOR_MODEL,
        durationMs: actDuration,
        tokens: actUsage,
        messages: [
          { role: 'system', content: String(actSys.content) },
          { role: 'user', content: String(actUser.content) }
        ],
        input: actorInput,
        output: actOutput,
        rawOutput: JSON.stringify(actOutput)
      },
      events: []
    });

    if (lessonState.status !== 'in_progress') {
      console.log(`🎉 Scenario resolved on Turn ${turnIndex} with status: '${lessonState.status}'!`);
      break;
    }
  }

  const completedMilestones = Object.entries(lessonState.milestones)
    .filter(([, s]) => s === 'done')
    .map(([id]) => id);
  const uncompletedMilestones = Object.entries(lessonState.milestones)
    .filter(([, s]) => s !== 'done')
    .map(([id]) => id);
  const filledSlots = Object.fromEntries(
    Object.entries(lessonState.slots)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, v?.value])
  );

  const totalTokens = turns.reduce(
    (acc, t) => {
      const dt = t.director?.tokens ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      const at = t.actor?.tokens ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      return {
        promptTokens: acc.promptTokens + dt.promptTokens + at.promptTokens,
        completionTokens: acc.completionTokens + dt.completionTokens + at.completionTokens,
        totalTokens: acc.totalTokens + dt.totalTokens + at.totalTokens
      };
    },
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  );

  const trace: SessionTrace = {
    sessionId,
    scenarioId: scenario.id,
    language: scenario.language,
    goal: scenario.goal,
    startedAt,
    updatedAt: new Date().toISOString(),
    scenario,
    initialState,
    turns,
    finalState: lessonState,
    status: lessonState.status,
    summary: {
      totalTurns: turns.length,
      completedMilestones,
      uncompletedMilestones,
      filledSlots,
      totalDirectorCalls: turns.length,
      totalActorCalls: turns.length,
      totalTokens,
      durationSeconds: Math.round((Date.now() - startedMs) / 1000)
    }
  };

  const tracesDir = path.resolve(process.cwd(), 'traces');
  if (!fs.existsSync(tracesDir)) fs.mkdirSync(tracesDir, { recursive: true });
  const tracePath = path.join(tracesDir, `${sessionId}.json`);
  fs.writeFileSync(tracePath, JSON.stringify(trace, null, 2), 'utf-8');

  const invariants = detectTraceInvariantViolations(trace);
  console.log(`🛡️  Deterministic Invariant Check: ${invariants.length} violation(s) found.`);
  for (const inv of invariants) {
    console.log(`   - [Turn ${inv.turnIndex ?? '?'}] [${inv.severity.toUpperCase()}] ${inv.description}`);
  }

  if (!shouldJudge) {
    console.log(`\n============================================================`);
    console.log(`✅ LESSON RUN COMPLETED`);
    console.log(`============================================================`);
    console.log(`Session ID: ${sessionId}`);
    console.log(`Persona:    ${persona}`);
    console.log(`Turns:      ${trace.turns.length}`);
    console.log(`Status:     ${trace.status}`);
    console.log(`Completed:  ${JSON.stringify(completedMilestones)}`);
    console.log(`💾 Raw Telemetry Trace: traces/${sessionId}.json`);
    console.log(`============================================================\n`);
  } else {
    console.log(`\n⚖️ Invoking Hybrid Judge (Deterministic + LLM) to evaluate session evidence...`);
    const report = await evaluateSessionCore(trace, { apiKey: OPENAI_API_KEY });
    printJudgeReport(sessionId, report);
  }
}

void runSimulation();
