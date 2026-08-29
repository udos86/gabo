import fs from 'node:fs';
import path from 'node:path';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { OPENAI_API_KEY, DIRECTOR_MODEL } from '$env/static/private';
import { judgeEvaluationSchema, type JudgeEvaluation, type JudgeReport, type SessionTrace } from '$lib/trace/types';

const openai = createOpenAI({ apiKey: OPENAI_API_KEY });
const JUDGE_MODEL = process.env.JUDGE_MODEL || DIRECTOR_MODEL || 'gpt-4o-mini';

function formatTraceForJudge(trace: SessionTrace): string {
  const lines: string[] = [];
  lines.push(`# Session Trace: ${trace.sessionId}`);
  lines.push(`- Scenario: ${trace.scenario?.id ?? trace.scenarioId} (${trace.language})`);
  lines.push(`- Goal: ${trace.goal}`);
  lines.push(`- Final Status: ${trace.status}`);
  lines.push(`- Total Turns: ${trace.turns.length}`);
  lines.push(`- Initial Variables: ${JSON.stringify(trace.initialState?.variables ?? {})}`);

  if (trace.scenario?.milestones) {
    lines.push(`\n## Scenario Milestones Def:`);
    for (const m of trace.scenario.milestones) {
      lines.push(`- [${m.id}] (${m.kind}): ${m.objective} | Rubric: ${m.rubric} | Prereqs: ${m.prerequisites.join(', ') || 'none'}${m.optional ? ' (optional)' : ''}`);
    }
  }

  if (trace.scenario?.frictions && trace.scenario.frictions.length > 0) {
    lines.push(`\n## Frictions Def:`);
    for (const f of trace.scenario.frictions) {
      lines.push(`- [${f.id}] attaches to ${f.attachesTo}: ${f.description} -> ${f.extraObjective}`);
    }
  }

  lines.push(`\n## Dialogue & Turn Execution:`);
  for (const turn of trace.turns) {
    lines.push(`\n### Turn ${turn.turnIndex}`);
    lines.push(`- Student input: "${turn.studentInput || '(none - scene opening)'}"`);

    if (turn.preState) {
      const activeMs = Object.entries(turn.preState.milestones)
        .filter(([, s]) => s === 'active' || s === 'eligible')
        .map(([id, s]) => `${id}:${s}`)
        .join(', ');
      const doneMs = Object.entries(turn.preState.milestones)
        .filter(([, s]) => s === 'done')
        .map(([id]) => id)
        .join(', ');
      lines.push(`- Pre-state: Focus: ${turn.preState.focusMilestoneId ?? 'none'} | Active/Eligible: [${activeMs}] | Done: [${doneMs}] | Mode: ${turn.preState.mode}`);
    }

    if (turn.director) {
      lines.push(`- Director Sensing:`);
      lines.push(`  * Proposed Completed Milestones: ${JSON.stringify(turn.director.output.observedDeltas.completedMilestones)}`);
      lines.push(`  * Filled Slots: ${JSON.stringify(turn.director.output.observedDeltas.filledSlots)}`);
      lines.push(`  * Resolved Frictions: ${JSON.stringify(turn.director.output.observedDeltas.resolvedFrictions)}`);
      lines.push(`  * Off-Topic: ${turn.director.output.observedDeltas.offTopic}`);
      lines.push(`- Director Stage Directions Authored: ${JSON.stringify(turn.director.output.stageDirections)}`);
      lines.push(`- Director Telemetry: ${turn.director.durationMs}ms | Tokens: ${turn.director.tokens?.totalTokens ?? 'n/a'}`);
    }

    if (turn.reducedState) {
      const doneNow = Object.entries(turn.reducedState.milestones)
        .filter(([, s]) => s === 'done')
        .map(([id]) => id)
        .join(', ');
      lines.push(`- Post-Reducer State: Done: [${doneNow}] | Next Focus: ${turn.reducedState.focusMilestoneId} | Status: ${turn.reducedState.status}`);
    }

    if (turn.actor) {
      lines.push(`- Actor Line Spoken: "${turn.actor.output.text}"`);
      if (turn.actor.output.action) {
        lines.push(`- Actor Action: *${turn.actor.output.action}*`);
      }
      lines.push(`- Actor Telemetry: ${turn.actor.durationMs}ms | Tokens: ${turn.actor.tokens?.totalTokens ?? 'n/a'}`);
    }
  }

  return lines.join('\n');
}

function buildMarkdownReport(trace: SessionTrace, report: JudgeEvaluation): string {
  const timestamp = new Date().toLocaleString();
  const md: string[] = [];

  md.push(`# 🎭 Gabo Session Evaluation Report`);
  md.push(`**Session ID:** \`${trace.sessionId}\`  `);
  md.push(`**Scenario:** \`${trace.scenarioId}\` (${trace.language})  `);
  md.push(`**Evaluated at:** ${timestamp}  `);
  md.push(`**Model:** \`${JUDGE_MODEL}\`  `);
  md.push(`**Result Status:** \`${trace.status}\` in ${trace.turns.length} turns  `);
  md.push(``);

  md.push(`## 📊 Overall Score: ${report.overallScore} / 10`);
  md.push(``);
  md.push(`| Category | Score (1-10) | Evaluation Criteria |`);
  md.push(`| :--- | :---: | :--- |`);
  md.push(`| **Naturalness & Immersion** | **${report.categoryScores.naturalness}** / 10 | Idiomatic dialogue, appropriate role tone, conversational flow |`);
  md.push(`| **Continuity & Consistency** | **${report.categoryScores.continuity}** / 10 | Adherence to world facts, memory across turns, no greeting loops |`);
  md.push(`| **Sensing & Rubric Accuracy** | **${report.categoryScores.sensingAccuracy}** / 10 | Timely and strict sensing of student inputs against milestones & slots |`);
  md.push(`| **Pedagogical Guidance** | **${report.categoryScores.pedagogicalGuidance}** / 10 | Clear stage directions, nudging without answering for the student |`);
  md.push(``);

  md.push(`## 📝 Executive Summary`);
  md.push(report.summary);
  md.push(``);

  md.push(`## 🎯 Milestone & Progression Analysis`);
  md.push(report.milestoneAnalysis);
  md.push(``);

  md.push(`## 🔍 Detailed Findings`);
  if (report.findings.length === 0) {
    md.push(`*No significant issues detected.*`);
  } else {
    for (const [i, f] of report.findings.entries()) {
      const icon = f.severity === 'critical' ? '🔴' : f.severity === 'warning' ? '🟡' : 'ℹ️';
      md.push(`### ${icon} Finding ${i + 1}: ${f.description} [${f.category.toUpperCase()}]`);
      if (f.turnIndex !== null && f.turnIndex !== undefined) {
        md.push(`- **Turn:** ${f.turnIndex}`);
      }
      md.push(`- **Severity:** \`${f.severity}\``);
      if (f.evidence) {
        md.push(`- **Evidence:** *"${f.evidence}"*`);
      }
      md.push(`- **Recommendation:** ${f.recommendation}`);
      md.push(``);
    }
  }

  md.push(`## 💡 Concrete Prompt & Instruction Recommendations`);
  if (report.promptRecommendations.length === 0) {
    md.push(`*No prompt modifications recommended.*`);
  } else {
    for (const rec of report.promptRecommendations) {
      md.push(`### Target: \`${rec.target}\``);
      md.push(`- **Observed Behavior:** ${rec.currentBehavior}`);
      md.push(`- **Recommended Change:** ${rec.recommendedChange}`);
      md.push(``);
    }
  }

  return md.join('\n');
}

export async function evaluateSession(trace: SessionTrace): Promise<JudgeReport> {
  const model = openai(JUDGE_MODEL);
  const formattedTrace = formatTraceForJudge(trace);

  const system = `
You are an expert Judge LLM for an interactive, didactic roleplay language learning application.
Your mission is to perform rigorous, evidence-based quality control and error analysis over a completed or in-progress session trace.

EVALUATION CRITERIA:
1. NATURALNESS & IMMERSION:
   - Does the NPC sound authentic, courteous, and idiomatic for the target language and setting?
   - Is the dialogue free from stiffness, bizarre English idioms translated literally, or robotic repetition?
2. CONTINUITY & WORLD FACTS:
   - Does the conversation maintain narrative continuity?
   - Does the Actor never repeat greetings (e.g. saying 'Bonjour' twice)?
   - Are previously stated user preferences (e.g. party size, inside/outside) respected?
3. SENSING & RUBRIC ACCURACY:
   - Did the Director correctly identify when the student completed a milestone?
   - Did the Director avoid false positives (marking complete before rubric criteria were met)?
   - Were slots (party_size, seating_preference, orders) filled with accurate values and evidence?
   - Did the system handle frictions (e.g. terrace full) properly?
4. PEDAGOGICAL GUIDANCE & STAGE DIRECTIONS:
   - Did the Director author stage directions that advance the story toward the focus milestone without giving away the student's lines?
   - Did the NPC prompt the user appropriately rather than taking the initiative away?

Output an objective, detailed evaluation following the schema with actionable recommendations.
`;

  const { output } = await generateText({
    model,
    system,
    prompt: `Analyze and evaluate the following roleplay session trace:\n\n${formattedTrace}`,
    output: Output.object({ schema: judgeEvaluationSchema })
  });

  const markdownReport = buildMarkdownReport(trace, output);

  // Persist markdown report to disk in traces/
  try {
    const tracesDir = path.resolve(process.cwd(), 'traces');
    if (!fs.existsSync(tracesDir)) fs.mkdirSync(tracesDir, { recursive: true });
    const reportPath = path.join(tracesDir, `report_${trace.sessionId}.md`);
    fs.writeFileSync(reportPath, markdownReport, 'utf-8');
  } catch (err) {
    console.error('Failed to write report to disk:', err);
  }

  return {
    ...output,
    sessionId: trace.sessionId,
    evaluatedAt: new Date().toISOString(),
    markdownReport
  };
}
