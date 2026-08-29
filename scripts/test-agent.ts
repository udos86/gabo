import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

export interface JudgeFinding {
  severity: string;
  category: string;
  description: string;
  evidence?: string | null;
  recommendation: string;
}

export interface PromptRecommendation {
  target: string;
  currentBehavior: string;
  recommendedChange: string;
}

export interface JudgeReport {
  overallScore: number;
  categoryScores: {
    naturalness: number;
    continuity: number;
    sensingAccuracy: number;
    pedagogicalGuidance: number;
  };
  summary: string;
  milestoneAnalysis: string;
  findings: JudgeFinding[];
  promptRecommendations?: PromptRecommendation[];
}

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

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const STUDENT_MODEL = process.env.STUDENT_MODEL || process.env.ACTOR_MODEL || 'gpt-4o-mini';
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173/chat';

// Parse command line args
const args = process.argv.slice(2);
let persona = 'polite';
let shouldJudge = false;

for (const arg of args) {
  if (arg.startsWith('--persona=')) {
    const p = arg.split('=')[1];
    if (p) persona = p;
  } else if (arg === '--judge') {
    shouldJudge = true;
  } else if (arg === '--no-judge') {
    shouldJudge = false;
  }
}

const openai = createOpenAI({ apiKey: OPENAI_API_KEY });

function getPersonaInstructions(personaType: string): string {
  switch (personaType) {
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

/**
 * Autonomous LLM-driven Student Agent.
 * Instead of static canned responses, this agent dynamically reacts to whatever
 * the Waiter actually said or asked, pursuing its overarching goal.
 */
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
- Do NOT jump ahead to steps that haven't been prompted yet (e.g. do not order food before you are seated and have the menu).
- If the waiter asks a question (e.g. inside or outside? how many people?), answer that question directly.
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

async function run() {
  console.log(`\n🤖 Launching Autonomous Dynamic Student Test Agent...`);
  console.log(`Persona: ${persona}`);
  console.log(`Student Model: ${STUDENT_MODEL}`);
  console.log(`Target URL: ${BASE_URL}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log(`📡 Navigating to ${BASE_URL}...`);
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for the opening waiter message to appear and finish animating
    console.log(`⏳ Waiting for Waiter's opening greeting...`);
    await page.waitForSelector('[data-testid="chat-bubble"][data-role="assistant"][data-status="done"]', { timeout: 30000 });

    const openingBubble = page.locator('[data-testid="chat-bubble"][data-role="assistant"][data-status="done"]').first();
    const openingText = (await openingBubble.innerText()).trim();
    console.log(`👋 Waiter: "${openingText}"\n`);

    // Retrieve Session ID
    const sessionId = await page.evaluate(() => {
      const win = globalThis as unknown as Record<string, unknown>;
      return win.__GABO_SESSION_ID__ as string;
    });
    console.log(`📋 Session ID: ${sessionId}\n`);

    let isFinished = false;
    let turnCount = 1;
    const MAX_TURNS = 7;

    while (!isFinished && turnCount <= MAX_TURNS) {
      turnCount++;

      // 1. Extract current dialogue history and latest waiter utterance from the DOM
      const messagesData = await page.evaluate(() => {
        const bubbles = document.querySelectorAll('[data-testid="chat-bubble"]');
        const list: Array<{ role: string; text: string }> = [];
        bubbles.forEach((b) => {
          const role = b.getAttribute('data-role') || 'unknown';
          const textEl = b.querySelector('[data-testid="bubble-text"]');
          const text = textEl ? (textEl as HTMLElement).innerText.trim() : (b as HTMLElement).innerText.trim();
          list.push({ role, text });
        });
        return list;
      });

      const dialogueHistory = messagesData.map((m) => `${m.role === 'assistant' ? 'Waiter' : 'Tourist'}: ${m.text}`).join('\n');
      const latestAssistantMsg = [...messagesData].reverse().find((m) => m.role === 'assistant');
      const latestWaiterLine = latestAssistantMsg?.text || openingText;

      // 2. Student LLM Agent decides dynamically what to say in response
      console.log(`🧠 [Turn ${turnCount}] Student Agent pondering reaction to: "${latestWaiterLine.slice(0, 60)}..."`);
      const studentInput = await generateStudentResponse({
        latestWaiterLine,
        dialogueHistory,
        turnNumber: turnCount,
        personaType: persona
      });

      console.log(`🗣️ Tourist (${persona}): "${studentInput}"`);

      // Count assistant messages before submission
      const prevAssistantCount = await page.locator('[data-testid="chat-bubble"][data-role="assistant"]').count();

      // 3. Type and submit into UI
      const inputLocator = page.locator('[data-testid="chat-input"]');
      await inputLocator.fill(studentInput);

      const submitBtn = page.locator('[data-testid="chat-submit"]');
      await submitBtn.click();

      // 4. Wait for the waiter's next reply to appear and finish animating
      await page.waitForFunction((expectedCount) => {
        const bubbles = document.querySelectorAll('[data-testid="chat-bubble"][data-role="assistant"][data-status="done"]');
        return bubbles.length >= expectedCount;
      }, prevAssistantCount + 1, { timeout: 35000 });

      await page.waitForTimeout(1000);

      const latestAssistantBubble = page.locator('[data-testid="chat-bubble"][data-role="assistant"][data-status="done"]').last();
      const latestAssistantText = (await latestAssistantBubble.innerText()).trim();
      console.log(`☕ Waiter: "${latestAssistantText}"`);

      // 5. Inspect Milestones Status
      const milestoneStatuses = await page.evaluate(() => {
        const items = document.querySelectorAll('[data-testid="milestone-item"]');
        const map: Record<string, string> = {};
        items.forEach((item) => {
          const id = item.getAttribute('data-milestone-id');
          const status = item.getAttribute('data-status');
          if (id && status) map[id] = status;
        });
        return map;
      });

      console.log(`📊 Milestones Status:`, milestoneStatuses);

      // Check if session status is finished
      const lessonState = await page.evaluate(() => {
        const win = globalThis as unknown as Record<string, unknown>;
        return typeof win.__GABO_LESSON_STATE__ === 'function' ? (win.__GABO_LESSON_STATE__ as () => { status?: string })() : null;
      });

      if (lessonState && lessonState.status !== 'in_progress') {
        console.log(`\n🎉 Scenario resolved with status: '${lessonState.status}'!`);
        isFinished = true;
      }
      console.log(``);
    }

    console.log(`🏁 Lesson simulation finished! Fetching complete session trace...`);
    const trace = await page.evaluate(async () => {
      const win = globalThis as unknown as Record<string, unknown>;
      return typeof win.__GABO_GET_TRACE__ === 'function' ? await (win.__GABO_GET_TRACE__ as () => Promise<unknown>)() : null;
    });

    const typedTrace = trace as { turns?: unknown[]; status?: string } | null;
    console.log(`📦 Captured full trace with ${typedTrace?.turns?.length ?? 0} turns. Final Status: ${typedTrace?.status ?? 'unknown'}`);

    if (!shouldJudge) {
      console.log(`\n============================================================`);
      console.log(`✅ LESSON RUN COMPLETED`);
      console.log(`============================================================`);
      console.log(`Session ID: ${sessionId}`);
      console.log(`Persona:    ${persona}`);
      console.log(`Turns:      ${typedTrace?.turns?.length ?? 0}`);
      console.log(`Status:     ${typedTrace?.status ?? 'unknown'}`);
      console.log(`💾 Raw Telemetry Trace: traces/${sessionId}.json`);
      console.log(`💡 To analyze this session, run:`);
      console.log(`   npm run test:analyze -- ${sessionId}`);
      console.log(`   Or pass '--judge' to evaluate directly upon playthrough.`);
      console.log(`============================================================\n`);
    } else {
      console.log(`\n⚖️ Invoking Judge LLM to evaluate session evidence...`);
      const judgeRes = await page.evaluate(async () => {
        const win = globalThis as unknown as Record<string, unknown>;
        return typeof win.__GABO_EVALUATE__ === 'function' ? await (win.__GABO_EVALUATE__ as () => Promise<{ error?: string; report?: JudgeReport }>)() : null;
      });

      if (!judgeRes || judgeRes.error || !judgeRes.report) {
        console.error(`❌ Judge Evaluation failed:`, judgeRes?.error ?? 'Unknown error or empty report');
      } else {
        const report = judgeRes.report;
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
          console.log(`  [${finding.severity.toUpperCase()}] [${finding.category}] ${finding.description}`);
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
    }

  } catch (err) {
    console.error(`💥 Dynamic Test Agent encountered an error:`, err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

void run();
