# Application Use Case & Purpose

This application is an interactive, narrative-driven language learning platform. It immerses users in dynamic roleplay scenarios (lessons) where they must converse in a target language (e.g., French) to achieve communicative milestones and advance the story.

## Agent Architecture and Roles

The application relies on specialized AI agents paired with a deterministic scenario state machine:

### 1. The Scenario Engine (`src/lib/scenario/`)
- **Purpose:** Defines the scenario DAG (`schema.ts`), tracks authoritative session state (`state.ts`), and deterministically validates and applies state transitions (`reducer.ts`).
- **Behavior:** Controls milestone prerequisites, slot provenance, narrative frictions, pedagogical modes (`advance`, `repair`, `pressure`, `deflect`), turn budgets, and win/timeout conditions.

### 2. The Director Agent (`src/lib/ai/director/`)
- **Purpose:** Acts as a hidden guide and evaluator behind the scenes.
- **Context:** Receives the current `LessonState`, scenario milestones/rubrics, active frictions, world facts, dialogue history, and the student's latest input.
- **Behavior:** Senses completed milestones, filled slots, and resolved frictions (`observedDeltas`) and authors the next `stageDirections` for the Actor. Every delta is a proposal validated by the scenario reducer.

### 3. The Actor Agent (`src/lib/ai/actor/`)
- **Purpose:** Plays the role of the NPC interlocutor(s) in the current scene.
- **Context:** Aware of the scene's slugline, dialogue history, world facts, run variables, character role, and the Director's stage directions.
- **Behavior:** Stays in character and responds naturally in the target language, providing conversational immersion.

### 4. The Teacher Agent (`src/lib/ai/teacher/`)
- **Purpose:** Evaluates individual student utterances against grammar, context, actions, naturalness, and tone to provide concise feedback and a `passed` boolean (available via `/api/agent/teacher`).

## Dialogue Flow

1. A lesson JSON (`src/lib/lessons/<id>.json`) is loaded and initialized via `createInitialState()`.
2. The **Actor Agent** opens or responds in character based on the current stage directions.
3. The User provides input via the chat interface (`src/routes/chat/`).
4. The **Director Agent** senses what the student accomplished and authors the next stage directions.
5. The **Scenario Reducer** (`reduce()`) validates and commits the Director's proposed deltas, updates milestones/modes/status, and hands off to the Actor for the next turn until all mandatory milestones are completed (`won`) or the turn budget runs out (`timed_out`).

## Development & Commands

The project uses Vite and SvelteKit. Below are the key commands for developing, linting, and testing the application:

- **Start Development Server**: `npm run dev` (Starts the Vite dev server, typically on `http://localhost:5173`)
- **Lint Code**: `npm run lint` (Runs ESLint)
- **Check Types/Svelte**: `npm run check` (Runs `svelte-check` against the TypeScript configuration)
- **Run Unit Tests**: `npm run test:unit` (Runs Vitest)
- **Build for Production**: `npm run build`
- **Preview Production Build**: `npm run preview`
