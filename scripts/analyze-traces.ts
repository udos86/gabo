import fs from 'node:fs';
import path from 'node:path';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import type { JudgeReport, SessionTrace } from '../src/lib/trace/types.js';

// Load .env manually if needed
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
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
const JUDGE_MODEL = process.env.JUDGE_MODEL || process.env.DIRECTOR_MODEL || 'gpt-4o-mini';
const BASE_URL = process.env.BASE_URL ? new URL(process.env.BASE_URL).origin : 'http://localhost:5173';

const openai = createOpenAI({ apiKey: OPENAI_API_KEY });

const metaAnalysisSchema = z.object({
  executiveSummary: z.string().describe('Synthesis of overarching strengths and weaknesses across all analyzed sessions'),
  recurringPatterns: z.array(
    z.object({
      pattern: z.string().describe('Clear description of recurring behavior across multiple sessions'),
      frequency: z.string().describe('How often it occurred, e.g. "3 of 4 sessions"'),
      impact: z.enum(['high', 'medium', 'low']),
      affectedComponent: z.enum(['director_prompt', 'actor_prompt', 'scenario_rubric', 'reducer_logic'])
    })
  ).describe('Recurring behavioral patterns identified across sessions'),
  systemicDefects: z.array(z.string()).describe('List of clear bugs or systemic issues that need fixing'),
  recommendedPromptChanges: z.array(
    z.object({
      target: z.enum(['director_prompt', 'actor_prompt', 'teacher_prompt', 'scenario_rubric', 'reducer_logic']),
      priority: z.enum(['urgent', 'important', 'nice_to_have']),
      problem: z.string(),
      concreteSuggestion: z.string()
    })
  ).describe('Prioritized, actionable prompt improvements')
});

async function evaluateTraceViaApi(trace: SessionTrace): Promise<JudgeReport> {
  const res = await fetch(`${BASE_URL}/api/trace/judge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trace, sessionId: trace.sessionId })
  });

  const data = (await res.json()) as { error?: string; report?: JudgeReport };
  if (!res.ok || !data.report) {
    throw new Error(data.error || `Evaluation failed with HTTP ${res.status}`);
  }
  return data.report;
}

function findTraceFiles(specifiedIds: string[], limit: number): string[] {
  const tracesDir = path.resolve(process.cwd(), 'traces');
  if (!fs.existsSync(tracesDir)) return [];

  if (specifiedIds.length > 0) {
    return specifiedIds
      .map((id) => {
        const file = id.endsWith('.json') ? id : `${id}.json`;
        return path.join(tracesDir, file);
      })
      .filter((filePath) => fs.existsSync(filePath));
  }

  const files = fs.readdirSync(tracesDir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('report_') && !f.startsWith('meta_') && !f.startsWith('test-'))
    .map((f) => ({
      name: f,
      time: fs.statSync(path.join(tracesDir, f)).mtimeMs
    }))
    .sort((a, b) => b.time - a.time)
    .slice(0, limit)
    .map((item) => path.join(tracesDir, item.name));

  return files;
}

async function run() {
  const args = process.argv.slice(2);
  let limit = 5;
  const specifiedIds: string[] = [];

  for (const arg of args) {
    if (arg.startsWith('--last=')) {
      limit = parseInt(arg.split('=')[1], 10) || 5;
    } else if (!arg.startsWith('--')) {
      specifiedIds.push(arg);
    }
  }

  console.log(`\n🔍 Gabo Multi-Session Trace Meta-Analyzer`);
  console.log(`Model: ${JUDGE_MODEL}`);

  const traceFiles = findTraceFiles(specifiedIds, limit);
  if (traceFiles.length === 0) {
    console.log(`❌ No trace files found in traces/ directory.`);
    console.log(`💡 Run a lesson simulation first using: npm run test:agent\n`);
    return;
  }

  console.log(`📁 Found ${traceFiles.length} trace(s) to analyze...\n`);

  const sessionsData: Array<{ trace: SessionTrace; report: JudgeReport }> = [];

  for (const filePath of traceFiles) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const trace = JSON.parse(raw) as SessionTrace;
    console.log(`⏳ Processing Session: ${trace.sessionId} (${trace.scenarioId}, ${trace.turns.length} turns)...`);

    let report: JudgeReport | null = null;
    const reportPath = path.join(path.dirname(filePath), `report_${trace.sessionId}.md`);

    // If report already exists and is fresh, we can evaluate or fetch via endpoint
    try {
      report = await evaluateTraceViaApi(trace);
      console.log(`  ✓ Evaluated: Score ${report.overallScore}/10 (Nat:${report.categoryScores.naturalness}, Cont:${report.categoryScores.continuity}, Sens:${report.categoryScores.sensingAccuracy}, Guid:${report.categoryScores.pedagogicalGuidance})`);
    } catch (err) {
      console.warn(`  ⚠️ Could not evaluate via /api/trace/judge (${err instanceof Error ? err.message : String(err)}). Checking for cached report on disk...`);
      if (fs.existsSync(reportPath)) {
        console.log(`  ✓ Found cached report on disk: ${reportPath}`);
      }
    }

    if (report) {
      sessionsData.push({ trace, report });
    }
  }

  if (sessionsData.length === 0) {
    console.log(`❌ No evaluated sessions available for meta-analysis.`);
    return;
  }

  // 1. Compute aggregate quantitative metrics
  const count = sessionsData.length;
  const avgOverall = (sessionsData.reduce((sum, s) => sum + s.report.overallScore, 0) / count).toFixed(1);
  const avgNatural = (sessionsData.reduce((sum, s) => sum + s.report.categoryScores.naturalness, 0) / count).toFixed(1);
  const avgContinuity = (sessionsData.reduce((sum, s) => sum + s.report.categoryScores.continuity, 0) / count).toFixed(1);
  const avgSensing = (sessionsData.reduce((sum, s) => sum + s.report.categoryScores.sensingAccuracy, 0) / count).toFixed(1);
  const avgGuidance = (sessionsData.reduce((sum, s) => sum + s.report.categoryScores.pedagogicalGuidance, 0) / count).toFixed(1);

  // Milestone completion frequency
  const milestoneCounts: Record<string, number> = {};
  for (const s of sessionsData) {
    const finalMs = s.trace.finalState?.milestones ?? s.trace.turns.at(-1)?.reducedState?.milestones ?? {};
    for (const [mId, status] of Object.entries(finalMs)) {
      if (status === 'done') {
        milestoneCounts[mId] = (milestoneCounts[mId] || 0) + 1;
      }
    }
  }

  // 2. Synthesize qualitative evidence across sessions
  console.log(`\n🧠 Running LLM Cross-Session Pattern Synthesis across ${count} sessions...`);

  const crossSessionEvidence: string[] = [];
  sessionsData.forEach(({ trace, report }, idx) => {
    crossSessionEvidence.push(`### Session ${idx + 1}: ${trace.sessionId} (${trace.turns.length} turns, Status: ${trace.status})`);
    crossSessionEvidence.push(`- Overall Score: ${report.overallScore}/10 (Nat: ${report.categoryScores.naturalness}, Cont: ${report.categoryScores.continuity}, Sens: ${report.categoryScores.sensingAccuracy}, Guid: ${report.categoryScores.pedagogicalGuidance})`);
    crossSessionEvidence.push(`- Summary: ${report.summary}`);
    crossSessionEvidence.push(`- Milestone Analysis: ${report.milestoneAnalysis}`);
    crossSessionEvidence.push(`- Findings (${report.findings.length}):`);
    for (const f of report.findings) {
      crossSessionEvidence.push(`  * [${f.severity.toUpperCase()}] [${f.category}] Turn ${f.turnIndex ?? 'all'}: ${f.description} (Evidence: "${f.evidence ?? 'none'}")`);
    }
    crossSessionEvidence.push(``);
  });

  const metaPrompt = `
You are a Principal AI Pedagogical & Evaluation Architect analyzing multiple dialogue play-sessions of a language learning app.
Below are the individual audit reports and metrics from ${count} separate session runs.

Perform a cross-session synthesis to identify:
1. Recurring patterns: issues that appear across several runs (not just one-off flukes).
2. Root causes: distinguish between Actor dialogue hallucination, Director sensing failures, scenario rubric ambiguities, or state reducer transition gaps.
3. Prioritized prompt tuning recommendations for the development team.

EVIDENCE FROM SESSIONS:
${crossSessionEvidence.join('\n')}
`;

  const { output: metaAnalysis } = await generateText({
    model: openai(JUDGE_MODEL),
    output: Output.object({ schema: metaAnalysisSchema }),
    system: 'You synthesize multi-session roleplay traces into actionable prompt and curriculum engineering recommendations.',
    prompt: metaPrompt
  });

  // 3. Format and save Markdown Meta-Report
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const tracesDir = path.resolve(process.cwd(), 'traces');
  const metaReportPath = path.join(tracesDir, `meta_report_${timestamp}.md`);

  const md: string[] = [];
  md.push(`# 📊 Gabo Cross-Session Meta-Analysis Report`);
  md.push(`**Generated at:** ${new Date().toLocaleString()}  `);
  md.push(`**Analyzed Sessions:** ${count}  `);
  md.push(`**Model:** \`${JUDGE_MODEL}\`  `);
  md.push(``);

  md.push(`## 📈 Aggregate Scorecard (Averages across ${count} runs)`);
  md.push(``);
  md.push(`| Metric | Average Score (1-10) | Target Benchmark |`);
  md.push(`| :--- | :---: | :---: |`);
  md.push(`| **Overall Score** | **${avgOverall}** / 10 | ≥ 8.5 / 10 |`);
  md.push(`| Naturalness & Immersion | ${avgNatural} / 10 | ≥ 8.5 / 10 |`);
  md.push(`| Continuity & Consistency | ${avgContinuity} / 10 | ≥ 8.5 / 10 |`);
  md.push(`| Sensing Accuracy | ${avgSensing} / 10 | ≥ 8.5 / 10 |`);
  md.push(`| Pedagogical Guidance | ${avgGuidance} / 10 | ≥ 8.5 / 10 |`);
  md.push(``);

  md.push(`## 🎯 Milestone Completion Rates`);
  for (const [mId, doneCount] of Object.entries(milestoneCounts)) {
    const pct = Math.round((doneCount / count) * 100);
    md.push(`- **\`${mId}\`**: ${doneCount} / ${count} (${pct}%)`);
  }
  md.push(``);

  md.push(`## 📝 Executive Meta-Summary`);
  md.push(metaAnalysis.executiveSummary);
  md.push(``);

  md.push(`## 🔁 Recurring Behavioral Patterns Across Sessions`);
  for (const p of metaAnalysis.recurringPatterns) {
    const badge = p.impact === 'high' ? '🔴 HIGH' : p.impact === 'medium' ? '🟡 MEDIUM' : 'ℹ️ LOW';
    md.push(`### [${badge}] ${p.pattern}`);
    md.push(`- **Observed Frequency:** ${p.frequency}`);
    md.push(`- **Component:** \`${p.affectedComponent}\``);
    md.push(``);
  }

  md.push(`## 🛠️ Systemic Defects Identified`);
  for (const bug of metaAnalysis.systemicDefects) {
    md.push(`- ⚠️ ${bug}`);
  }
  md.push(``);

  md.push(`## 💡 Prioritized Actionable Prompt Improvements`);
  for (const rec of metaAnalysis.recommendedPromptChanges) {
    const prioIcon = rec.priority === 'urgent' ? '🚨 URGENT' : rec.priority === 'important' ? '⚡ IMPORTANT' : '🌱 NICE TO HAVE';
    md.push(`### [${prioIcon}] Target: \`${rec.target}\``);
    md.push(`- **Problem Identified:** ${rec.problem}`);
    md.push(`- **Concrete Suggestion:** ${rec.concreteSuggestion}`);
    md.push(``);
  }

  md.push(`## 📋 Sessions Included in This Cohort`);
  for (const s of sessionsData) {
    md.push(`- \`${s.trace.sessionId}\`: ${s.trace.turns.length} turns, Score: **${s.report.overallScore}/10**, Status: \`${s.trace.status}\``);
  }

  fs.writeFileSync(metaReportPath, md.join('\n'), 'utf-8');

  // 4. Output Summary to Terminal
  console.log(`\n============================================================`);
  console.log(`🏆 GABO CROSS-SESSION META-ANALYSIS SUMMARY (${count} SESSIONS)`);
  console.log(`============================================================`);
  console.log(`Aggregate Scores:`);
  console.log(`  Overall Average:   ${avgOverall} / 10`);
  console.log(`  Naturalness:       ${avgNatural} / 10`);
  console.log(`  Continuity:        ${avgContinuity} / 10`);
  console.log(`  Sensing Accuracy:  ${avgSensing} / 10`);
  console.log(`  Pedagogy/Guidance: ${avgGuidance} / 10`);
  console.log(`\nExecutive Summary:`);
  console.log(metaAnalysis.executiveSummary);
  console.log(`\nRecurring Patterns Identified (${metaAnalysis.recurringPatterns.length}):`);
  for (const p of metaAnalysis.recurringPatterns) {
    console.log(`  [${p.impact.toUpperCase()}] (${p.frequency}) ${p.pattern} -> ${p.affectedComponent}`);
  }
  console.log(`\nTop Prompt Tuning Recommendations (${metaAnalysis.recommendedPromptChanges.length}):`);
  for (const rec of metaAnalysis.recommendedPromptChanges) {
    console.log(`  [${rec.priority.toUpperCase()}] [${rec.target}]`);
    console.log(`  -> ${rec.concreteSuggestion}`);
  }
  console.log(`\n📄 Full Consolidated Meta-Report written to:`);
  console.log(`   ${metaReportPath}`);
  console.log(`============================================================\n`);
}

void run();
