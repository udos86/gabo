---
name: trace-analyzer
description: >-
  Quality audit and prompt analysis skill for Gabo roleplay lessons.
  Use this skill whenever you need to evaluate, audit, or synthesize patterns across
  single or multiple session traces to diagnose continuity, naturalness, milestone sensing,
  and recommend prompt refinements.
---

# Trace Analyzer Skill (Gabo)

This skill performs rigorous, evidence-based quality control and cross-session pattern synthesis over recorded flight-recorder traces in Gabo.

---

## When to Use

- After playing one or more sessions with `lesson-player`.
- To diagnose why an NPC said something unnatural, repeated a greeting, or failed to advance a milestone.
- To detect systematic prompt bugs versus random single-session variations.
- To formulate concrete prompt tuning recommendations for `director_prompt`, `actor_prompt`, or `scenario_rubric`.

---

## Evaluation Workflows

### Workflow 1: Single-Session Audit
Audit a single session by ID:
```bash
npm run test:analyze -- <sessionId>
```
Or via the interactive web UI:
1. Open `http://localhost:5173/chat`.
2. Click the **"Trace & Telemetry"** badge in the top right.
3. Click **"⚖️ Run Judge Audit"** to view scores, findings, and prompt suggestions in the drawer.
4. Read the generated markdown report from `traces/report_<sessionId>.md`.

### Workflow 2: Cross-Session Meta-Analysis (Batch Synthesis)
Synthesize patterns across the last $N$ sessions:
```bash
# Analyze the last 5 sessions
npm run test:analyze

# Analyze the last 3 sessions
npm run test:analyze -- --last=3

# Analyze specific cohorts
npm run test:analyze -- <sessionId1> <sessionId2> <sessionId3>
```

The analyzer will:
1. Ensure all candidate sessions have completed individual evaluations.
2. Aggregate quantitative metrics (average scores, milestone completion drop-off rates).
3. Cluster recurring behavioral patterns across sessions.
4. Distinguish between random variance and systematic defects.
5. Generate a comprehensive Markdown meta-report in `traces/meta_report_<timestamp>.md`.
