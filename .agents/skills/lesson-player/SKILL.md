---
name: lesson-player
description: >-
  Autonomous learner simulation agent that plays through Gabo roleplay lessons.
  Use this skill whenever you need to play through a lesson scenario (e.g. French café),
  test different student personas (polite, friction, terse), and generate fresh session traces.
---

# Lesson Player Skill (Gabo)

This skill drives autonomous student playthroughs of interactive Gabo language lessons. Its primary objective is to embody specific learner personas, advance dialogue turn-by-turn against the NPC, and record complete flight-recorder telemetry to `traces/<sessionId>.json`.

---

## Supported Learner Personas

- **`polite`** (Default): Cooperative, polite A2-B1 learner who answers questions politely and follows suggestions.
- **`friction`**: Boundary tester who insists on preferred seating (e.g. terrace even when full), asks questions about the menu, and tests error handling.
- **`terse`**: Beginner A1 learner who speaks in short phrases ("Une table", "Dedans", "Un café").

---

## Execution Modes

### Mode A: Interactive Playthrough via Browser Subagent
Use the `browser_subagent` tool with `RecordingName: 'lesson_playthrough'`.

**Instructions for the Subagent:**
1. Navigate to `http://127.0.0.1:5173/chat?autoPersist=true`.
2. Wait until the Waiter's opening message appears with status `done` (`[data-testid="chat-bubble"][data-role="assistant"][data-status="done"]`).
3. **Turn Loop (up to 7 turns):**
   - Read the latest Assistant bubble text.
   - Formulate a contextual response matching the chosen learner persona.
   - Type response into `[data-testid="chat-input"]` and click `[data-testid="chat-submit"]`.
   - Wait for the next Assistant reply bubble with status `done`.
   - Check `[data-testid="milestones-panel"]` for updated milestones.
   - Stop when all required milestones are `done` or max turns reached.
4. Call `window.__GABO_PERSIST_TRACE__()` (or click `[data-testid="save-trace-btn"]`) to guarantee the trace is persisted to `traces/<sessionId>.json`.
5. Extract and report the generated Session ID from `window.__GABO_SESSION_ID__`.

### Mode B: Headless CLI Runner
For rapid playthroughs or batch generation:
```bash
# Play standard polite session
npm run test:agent

# Play friction / edge-case session
npm run test:agent -- --persona=friction

# Play terse beginner session
npm run test:agent -- --persona=terse
```

All session telemetry (student inputs, Director decisions, Reducer transitions, Actor lines, tokens, and latencies) is automatically persisted to `traces/<sessionId>.json`.
