---
name: trace-remediator
description: >-
  Remediation and prompt optimization agent for Gabo roleplay lessons.
  Reads a trace-analyzer meta-report, produces a structured implementation plan to address
  systemic defects and recurring patterns, executes prompt and scenario fixes, runs verification
  gates, and purges the audited cohort traces and reports upon successful completion.
---

# Trace Remediator Skill (Gabo)

This skill closes the autonomous feedback loop in Gabo:
1. **`lesson-player`**: Plays roleplay sessions across diverse learner personas (`polite`, `friction`, `terse`) and generates flight-recorder traces (`traces/<sessionId>.json`).
2. **`trace-analyzer`**: Audits traces with the LLM Judge and synthesizes cross-session meta-reports (`traces/meta_report_<timestamp>.md`).
3. **`trace-remediator` (This Skill)**: Turns the meta-report into a concrete implementation plan, applies prompt/rubric/logic fixes, verifies stability with typecheck and unit tests, and cleans up the resolved cohort trace files.

---

## Remediation Workflow

### Phase 1: Meta-Report Ingestion & Extraction
1. **Locate the Meta-Report**:
   - By default, pick the latest file matching `traces/meta_report_*.md`, or target a specific file specified in the prompt (e.g. `traces/meta_report_2026-09-05T19-17-30-277Z.md`).
2. **Extract Key Sections**:
   - **Cohorts / Session IDs**: Look under `## 📋 Sessions Included in This Cohort` for all `- \`<sessionId>\`` items. These are the trace sessions to be remediated and subsequently pruned.
   - **Scorecard & Drop-offs**: Check `## 📈 Aggregate Scorecard` and `## 🎯 Milestone Completion Rates` to understand where learners stall.
   - **Recurring Behavioral Patterns**: Check `## 🔁 Recurring Behavioral Patterns Across Sessions` (note impact levels: `[HIGH]`, `[MEDIUM]`, and component affected).
   - **Systemic Defects**: Check `## 🛠️ Systemic Defects Identified`.
   - **Prioritized Prompt Improvements**: Check `## 💡 Prioritized Actionable Prompt Improvements` (`[URGENT]`, `[IMPORTANT]`, `[NICE TO HAVE]`).

### Phase 2: Implementation Planning
Before writing or modifying code, formulate a structured Implementation Plan:
1. **Map targets to concrete source files**:
   - `scenario_rubric` / environmental rules / frictions:
     - `src/lib/lessons/<lessonId>.json` (e.g., `cafe-001.json` milestones, rubrics, frictions, assumptions)
     - `src/lib/scenario/scenario.ts`
   - `director_prompt` / sensing logic:
     - `src/lib/ai/director.ts` (`systemPrompt`, `MODE_GUIDANCE`, `effectiveRubric`)
     - `src/lib/scenario/reducer.ts` (milestone state transition rules)
   - `actor_prompt` / dialogue tone / guidance:
     - `src/lib/ai/actor.ts` (`buildActorMessages`, tone, open-ended elicitation)
   - `teacher_prompt` / evaluation:
     - `src/lib/ai/teacher.ts`
2. **Detail proposed changes**:
   - Clearly state the problem, root cause, and the exact diff / prompt tweak needed.
   - List the cohort files queued for cleanup once verified.
3. If operating in interactive planning mode, present the implementation plan to the user for confirmation.

### Phase 3: Execution & Remediation
Apply the necessary modifications using file edit tools:
- Refine rubric text and milestone completion criteria in scenario JSONs.
- Clarify Director sensing rules or stage-direction prompting in `director.ts`.
- Adjust Actor behavioral guidelines in `actor.ts`.
- Enhance reducer logic or friction specifications if state tracking is involved.

### Phase 4: Verification Gate
Always verify the changes before proceeding to trace cleanup:
```bash
# 1. Typecheck and Svelte check
npm run check

# 2. Unit tests (reducer, judge, traceStore)
npm run test:unit
```

### Phase 5: Cohort Trace Cleanup
Only when all edits are successfully applied and verification tests pass:
1. **Run Cohort Cleanup Script**:
   ```bash
   # Automatically cleans up all traces and reports associated with the latest meta-report
   npm run test:clean

   # Or specify a particular meta-report
   npm run test:clean -- traces/meta_report_<timestamp>.md

   # (Optional) Dry-run to inspect files first
   npm run test:clean -- --dry-run
   ```
2. **What gets removed**:
   - For every session ID `<sessionId>` in the cohort:
     - `traces/<sessionId>.json`
     - `traces/report_<sessionId>.md`
   - The processed `traces/meta_report_<timestamp>.md` file.
3. **Verify Directory State**:
   Confirm via `list_dir` on `traces/` that resolved session traces are pruned and the repository is ready for a clean new batch of tests.
