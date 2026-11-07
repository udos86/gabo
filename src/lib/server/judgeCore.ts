import fs from 'node:fs';
import path from 'node:path';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import {
  judgeEvaluationSchema,
  type JudgeEvaluation,
  type JudgeFinding,
  type JudgeReport,
  type SessionTrace
} from '#lib/trace/types';

/**
 * Runs deterministic structural invariant checks over a recorded session trace
 * before invoking the LLM Judge. Catches split-brain desynchronizations,
 * slot-without-milestone omissions, hallucinated frictions, and invalid IDs with 100% precision.
 */
export function detectTraceInvariantViolations(trace: SessionTrace): JudgeFinding[] {
  const findings: JudgeFinding[] = [];
  const milestones = trace.scenario?.milestones ?? [];
  const slots = trace.scenario?.slots ?? [];
  const frictions = trace.scenario?.frictions ?? [];

  const validMilestoneIds = new Set(milestones.map((m) => m.id));
  const validSlotIds = new Set(slots.map((s) => s.id));
  let actorHasGreeted = false;

  for (let i = 0; i < trace.turns.length; i++) {
    const turn = trace.turns[i]!;
    const prevTurn = i > 0 ? trace.turns[i - 1] : undefined;
    const preState = turn.preState ?? prevTurn?.reducedState ?? trace.initialState;
    const postState = turn.reducedState;
    const directorOut = turn.director?.output;
    const actorOut = turn.actor?.output;

    if (directorOut) {
      const completed = directorOut.observedDeltas.completedMilestones;
      const filled = directorOut.observedDeltas.filledSlots;
      const stageDirText = directorOut.stageDirections.join(' ');

      // Invariant 1: Invalid milestone or slot IDs emitted by Director
      for (const mId of completed) {
        if (!validMilestoneIds.has(mId)) {
          findings.push({
            category: 'technical',
            severity: 'critical',
            turnIndex: turn.turnIndex,
            description: `Director emitted an invalid milestone ID "${mId}" not present in the scenario schema (silently dropped by reducer).`,
            evidence: JSON.stringify(completed),
            recommendation: `Ensure Director system prompt formats milestone IDs unambiguously and instructs reporting only exact milestone IDs.`
          });
        }
      }

      for (const slotFill of filled) {
        if (!validSlotIds.has(slotFill.slotId)) {
          findings.push({
            category: 'technical',
            severity: 'critical',
            turnIndex: turn.turnIndex,
            description: `Director emitted an invalid slot ID "${slotFill.slotId}" not present in the scenario schema.`,
            evidence: JSON.stringify(filled),
            recommendation: `Ensure Director uses only exact slot IDs defined in the scenario.`
          });
        }
      }

      // Invariant 2: Slot-Without-Milestone Desync
      // If the Director fills all slots required by an uncompleted milestone (and no active friction is attached to it),
      // yet omits that milestone from completedMilestones.
      if (preState) {
        const filledIdsThisTurn = new Set(filled.map((s) => s.slotId));
        for (const m of milestones) {
          const preStatus = preState.milestones[m.id];
          const hasAttachedActiveFriction = frictions.some(
            (f) => f.attachesTo === m.id && preState.activeFrictions.includes(f.id)
          );
          if (
            preStatus !== 'done' &&
            m.fillsSlots.length > 0 &&
            !hasAttachedActiveFriction &&
            m.fillsSlots.every((reqSlot) => filledIdsThisTurn.has(reqSlot) || Boolean(preState.slots[reqSlot])) &&
            m.fillsSlots.some((reqSlot) => filledIdsThisTurn.has(reqSlot)) &&
            !completed.includes(m.id)
          ) {
            findings.push({
              category: 'sensing_accuracy',
              severity: 'critical',
              turnIndex: turn.turnIndex,
              description: `Slot-Milestone Desync: Director filled slot(s) [${m.fillsSlots.join(', ')}] for milestone "${m.id}", but failed to include "${m.id}" in completedMilestones.`,
              evidence: `Student: "${turn.studentInput}" | filledSlots: ${JSON.stringify(filled)} | completedMilestones: ${JSON.stringify(completed)}`,
              recommendation: `Enforce in Director prompt Rule 1 that filling a milestone's required slot (e.g. ${m.fillsSlots.join(', ')}) requires verifying and reporting the corresponding milestone ("${m.id}") in completedMilestones on the same turn.`
            });
          }
        }
      }

      // Invariant 3: Sensing-Authoring Split-Brain (Premature Menu Presentation before choose_location is done)
      if (postState && validMilestoneIds.has('choose_location') && validMilestoneIds.has('get_seated')) {
        const chooseLocStatus = postState.milestones['choose_location'];
        const mentionsMenuPresentation =
          /\b(present|hand|give|bring|place|offer|présent|donn|apport|remet)\w*\b.*\b(menu|carte)\b/i.test(stageDirText) ||
          /\bvoici\s+(votre|la|notre)\s+(menu|carte)\b/i.test(stageDirText);

        if (chooseLocStatus !== 'done' && mentionsMenuPresentation) {
          findings.push({
            category: 'sensing_accuracy',
            severity: 'critical',
            turnIndex: turn.turnIndex,
            description: `Sensing-Authoring Split-Brain: Director stageDirections advanced to presenting the menu ("get_seated") while prerequisite milestone "choose_location" remained "${chooseLocStatus}" (not in completedMilestones).`,
            evidence: `completedMilestones: ${JSON.stringify(completed)} | stageDirections: ${JSON.stringify(directorOut.stageDirections)}`,
            recommendation: `Synchronize Director Sensing and Authoring: either mark "choose_location" complete in completedMilestones if the student accepted/adapted, or do not direct the NPC to present the menu yet.`
          });
        }
      }

      // Invariant 4: Hallucinated Terrace-Full Obstacle when no friction is active
      if (preState && preState.activeFrictions.length === 0 && (!postState || postState.activeFrictions.length === 0)) {
        const combinedText = `${stageDirText} ${actorOut?.text ?? ''}`;
        const claimsTerraceFull =
          /\b(terrace|terrasse)\b.*\b(full|comble|complète|unavailable|occupée)\b/i.test(combinedText);
        if (claimsTerraceFull) {
          findings.push({
            category: 'continuity',
            severity: 'critical',
            turnIndex: turn.turnIndex,
            description: `Hallucinated Friction: Director/Actor claimed the terrace is full even though activeFrictions is empty ([]).`,
            evidence: `activeFrictions: [] | stageDirections: ${JSON.stringify(directorOut.stageDirections)}`,
            recommendation: `Do not mention terrace_full examples in Director system prompt when activeFrictions is empty.`
          });
        }
      }
    }

    // Invariant 5: Repeated Greeting by Actor
    if (actorOut?.text) {
      const hasBonjour = /\bbonjour\b/i.test(actorOut.text);
      if (hasBonjour) {
        if (actorHasGreeted) {
          findings.push({
            category: 'continuity',
            severity: 'warning',
            turnIndex: turn.turnIndex,
            description: `Repeated Greeting: Actor said "Bonjour" again after already greeting the guest in an earlier turn.`,
            evidence: actorOut.text,
            recommendation: `Ensure Actor prompt Rule 4 strictly forbids repeating greetings after Turn 1.`
          });
        }
        actorHasGreeted = true;
      }
    }
  }

  return findings;
}

export function formatTraceForJudge(trace: SessionTrace, invariantFindings: JudgeFinding[] = []): string {
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
      lines.push(
        `- [${m.id}] (${m.kind}): ${m.objective} | Rubric: ${m.rubric} | Prereqs: ${m.prerequisites.join(', ') || 'none'}${m.optional ? ' (optional)' : ''}`
      );
    }
  }

  if (trace.scenario?.frictions && trace.scenario.frictions.length > 0) {
    lines.push(`\n## Frictions Def:`);
    for (const f of trace.scenario.frictions) {
      lines.push(`- [${f.id}] attaches to ${f.attachesTo}: ${f.description} -> ${f.extraObjective}`);
    }
  }

  if (invariantFindings.length > 0) {
    lines.push(`\n## Deterministic Invariant Violations Detected (Ground Truth — MUST be reflected in your evaluation):`);
    for (const f of invariantFindings) {
      lines.push(
        `- [${f.severity.toUpperCase()}] [${f.category}] Turn ${f.turnIndex ?? 'all'}: ${f.description} | Evidence: ${f.evidence ?? 'n/a'}`
      );
    }
  }

  lines.push(`\n## Dialogue & Turn Execution:`);
  for (let i = 0; i < trace.turns.length; i++) {
    const turn = trace.turns[i]!;
    const prevTurn = i > 0 ? trace.turns[i - 1] : undefined;
    const preState = turn.preState ?? prevTurn?.reducedState ?? trace.initialState;

    lines.push(`\n### Turn ${turn.turnIndex}`);
    lines.push(`- Student input: "${turn.studentInput || '(none - scene opening)'}"`);

    if (preState) {
      const activeMs = Object.entries(preState.milestones)
        .filter(([, s]) => s === 'active' || s === 'eligible')
        .map(([id, s]) => `${id}:${s}`)
        .join(', ');
      const doneMs = Object.entries(preState.milestones)
        .filter(([, s]) => s === 'done')
        .map(([id]) => id)
        .join(', ');
      lines.push(
        `- Pre-state: Focus: ${preState.focusMilestoneId ?? 'none'} | Active/Eligible: [${activeMs}] | Done: [${doneMs}] | Active Frictions: [${preState.activeFrictions.join(', ')}] | Mode: ${preState.mode}`
      );
    }

    if (turn.director) {
      lines.push(`- Director Sensing:`);
      lines.push(
        `  * Proposed Completed Milestones: ${JSON.stringify(turn.director.output.observedDeltas.completedMilestones)}`
      );
      lines.push(`  * Filled Slots: ${JSON.stringify(turn.director.output.observedDeltas.filledSlots)}`);
      lines.push(`  * Resolved Frictions: ${JSON.stringify(turn.director.output.observedDeltas.resolvedFrictions)}`);
      lines.push(`  * Off-Topic: ${turn.director.output.observedDeltas.offTopic}`);
      lines.push(`- Director Stage Directions Authored: ${JSON.stringify(turn.director.output.stageDirections)}`);
      lines.push(
        `- Director Telemetry: ${turn.director.durationMs}ms | Tokens: ${turn.director.tokens?.totalTokens ?? 'n/a'}`
      );
    }

    if (turn.reducedState) {
      const doneNow = Object.entries(turn.reducedState.milestones)
        .filter(([, s]) => s === 'done')
        .map(([id]) => id)
        .join(', ');
      lines.push(
        `- Post-Reducer State: Done: [${doneNow}] | Next Focus: ${turn.reducedState.focusMilestoneId} | Active Frictions: [${turn.reducedState.activeFrictions.join(', ')}] | Status: ${turn.reducedState.status}`
      );
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

export function buildMarkdownReport(trace: SessionTrace, report: JudgeEvaluation, modelName: string): string {
  const timestamp = new Date().toLocaleString();
  const md: string[] = [];

  md.push(`# 🎭 Gabo Session Evaluation Report`);
  md.push(`**Session ID:** \`${trace.sessionId}\`  `);
  md.push(`**Scenario:** \`${trace.scenarioId}\` (${trace.language})  `);
  md.push(`**Evaluated at:** ${timestamp}  `);
  md.push(`**Model:** \`${modelName}\`  `);
  md.push(`**Result Status:** \`${trace.status}\` in ${trace.turns.length} turns  `);
  md.push(``);

  md.push(`## 📊 Overall Score: ${report.overallScore} / 10`);
  md.push(``);
  md.push(`| Category | Score (1-10) | Evaluation Criteria |`);
  md.push(`| :--- | :---: | :--- |`);
  md.push(
    `| **Naturalness & Immersion** | **${report.categoryScores.naturalness}** / 10 | Idiomatic dialogue, appropriate role tone, conversational flow |`
  );
  md.push(
    `| **Continuity & Consistency** | **${report.categoryScores.continuity}** / 10 | Adherence to world facts, memory across turns, no greeting loops |`
  );
  md.push(
    `| **Sensing & Rubric Accuracy** | **${report.categoryScores.sensingAccuracy}** / 10 | Timely and strict sensing of student inputs against milestones & slots |`
  );
  md.push(
    `| **Pedagogical Guidance** | **${report.categoryScores.pedagogicalGuidance}** / 10 | Clear stage directions, nudging without answering for the student |`
  );
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

/**
 * Merges deterministic invariant findings with LLM Judge findings, deduplicating
 * by (turnIndex, category) if the LLM already echoed the exact deterministic finding,
 * and caps category/overall scores if critical deterministic violations occurred.
 */
export function mergeInvariantAndLlmEvaluation(
  invariantFindings: JudgeFinding[],
  llmEval: JudgeEvaluation
): JudgeEvaluation {
  const mergedFindings: JudgeFinding[] = [...invariantFindings];

  for (const llmFinding of llmEval.findings) {
    const isDuplicate = invariantFindings.some(
      (det) =>
        det.turnIndex === llmFinding.turnIndex &&
        det.category === llmFinding.category &&
        det.severity === llmFinding.severity
    );
    if (!isDuplicate) {
      mergedFindings.push(llmFinding);
    }
  }

  const categoryScores = { ...llmEval.categoryScores };
  const hasCriticalSensing = invariantFindings.some(
    (f) => f.severity === 'critical' && (f.category === 'sensing_accuracy' || f.category === 'technical')
  );
  const hasCriticalContinuity = invariantFindings.some((f) => f.severity === 'critical' && f.category === 'continuity');

  if (hasCriticalSensing) {
    categoryScores.sensingAccuracy = Math.min(categoryScores.sensingAccuracy, 5);
  }
  if (hasCriticalContinuity) {
    categoryScores.continuity = Math.min(categoryScores.continuity, 5);
  }

  const recomputedAvg =
    (categoryScores.naturalness +
      categoryScores.continuity +
      categoryScores.sensingAccuracy +
      categoryScores.pedagogicalGuidance) /
    4;
  const overallScore =
    hasCriticalSensing || hasCriticalContinuity
      ? Number(Math.min(llmEval.overallScore, recomputedAvg).toFixed(1))
      : llmEval.overallScore;

  return {
    ...llmEval,
    overallScore,
    categoryScores,
    findings: mergedFindings
  };
}

export async function evaluateSessionCore(
  trace: SessionTrace,
  options: { apiKey: string; modelName?: string }
): Promise<JudgeReport> {
  const modelName = options.modelName || 'gpt-4o-mini';
  const openai = createOpenAI({ apiKey: options.apiKey });
  const model = openai(modelName);

  const invariantFindings = detectTraceInvariantViolations(trace);
  const formattedTrace = formatTraceForJudge(trace, invariantFindings);

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
   - Did the Director avoid Split-Brain behavior (e.g. filling a milestone's slot or advancing stageDirections to the next stage without marking the current milestone complete)?
   - Did the Director avoid false positives (marking complete before rubric criteria were met)?
   - Were slots (party_size, seating_preference, orders) filled with accurate values and evidence?
   - Did the system handle frictions (e.g. terrace full) properly?
4. PEDAGOGICAL GUIDANCE & STAGE DIRECTIONS:
   - Did the Director author stage directions that advance the story toward the focus milestone without giving away the student's lines?
   - Did the NPC prompt the user appropriately rather than taking the initiative away?

IMPORTANT: If "Deterministic Invariant Violations Detected" are listed in the prompt, treat them as verified ground-truth defects. Penalize the relevant category score accordingly and formulate concrete promptRecommendations to address them.
`;

  const { output: rawOutput } = await generateText({
    model,
    system,
    prompt: `Analyze and evaluate the following roleplay session trace:\n\n${formattedTrace}`,
    output: Output.object({ schema: judgeEvaluationSchema })
  });

  const finalEval = mergeInvariantAndLlmEvaluation(invariantFindings, rawOutput);
  const markdownReport = buildMarkdownReport(trace, finalEval, modelName);

  try {
    const tracesDir = path.resolve(process.cwd(), 'traces');
    if (!fs.existsSync(tracesDir)) fs.mkdirSync(tracesDir, { recursive: true });
    const reportPath = path.join(tracesDir, `report_${trace.sessionId}.md`);
    fs.writeFileSync(reportPath, markdownReport, 'utf-8');
  } catch (err) {
    console.error('Failed to write report to disk:', err);
  }

  return {
    ...finalEval,
    sessionId: trace.sessionId,
    evaluatedAt: new Date().toISOString(),
    markdownReport
  };
}

