# Application Use Case & Purpose

This application is an interactive, narrative-driven language learning platform. It immerses users in dynamic scenarios (screenplays/plays) where they must converse in a target language (e.g., French) to advance the story. Instead of traditional language exercises, users interact via a chat interface, acting out their part in a "beat" or scene while AI agents play the roles of other characters and guide the learning process.

## Agent Architecture and Roles

The application relies on two distinct AI agents that work together to create the interactive learning experience:

### 1. The Actor Agent
- **Purpose:** Plays the role of the interlocutor(s) in the current scene.
- **Context:** Aware of the screenplay's slugline, the current beat's actions, the target language, and its assigned character role (including gender and description).
- **Behavior:** Stays in character and responds to the user naturally based on the ongoing dialogue and the specific actions defined for the current scene. It provides the conversational immersion.

### 2. The Teacher Agent
- **Purpose:** Acts as a hidden guide and evaluator behind the scenes.
- **Context:** Has access to the same context as the Actor Agent, plus the user's most recent input.
- **Behavior:** Evaluates the user's input to determine if it meets the requirements of the current scene/beat. It provides constructive feedback to help the user improve their language skills and returns a `passed` boolean. 
- **Flow Control:** If the Teacher determines the user has successfully fulfilled the goal of the current beat (`passed: true`), the application advances to the next beat in the screenplay. If not, the user must try again based on the Teacher's feedback.

## Dialogue Flow

1. The scene (Play) starts at a specific beat. If the character speaking is an AI, the **Actor Agent** generates the dialogue.
2. The User provides input via the chat interface to respond or initiate conversation.
3. The **Teacher Agent** evaluates the user's input. It provides textual feedback and a pass/fail determination.
4. If the user passes, the beat advances. If the next speaker is an AI, the Actor Agent is invoked again. If the user fails, the scene remains on the current beat, and the user tries again, guided by the Teacher's feedback.

## Development & Commands

The project uses Vite and SvelteKit. Below are the key commands for developing, linting, and testing the application:

- **Start Development Server**: `npm run dev` (Starts the Vite dev server, typically on `http://localhost:5173`)
- **Lint Code**: `npm run lint` (Runs ESLint)
- **Check Types/Svelte**: `npm run check` (Runs `svelte-check` against the TypeScript configuration)
- **Run Unit Tests**: `npm run test:unit` (Runs Vitest)
- **Build for Production**: `npm run build`
- **Preview Production Build**: `npm run preview`
