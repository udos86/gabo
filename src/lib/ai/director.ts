import { Output, streamText } from 'ai';

import type { AgentContext, CharacterRoleInput } from '$lib/ai/schema';
import { directorOutputSchema, type LessonState } from '$lib/scenario/state';
import type { FrictionDef, MilestoneDef, Scenario } from '$lib/scenario/scenario';

export interface DirectorMilestoneView {
  id: string;
  objective: string;
  kind: string;
  effectiveRubric: string;
  status: string;
  optional: boolean;
  fillsSlots: string[];
}

export interface DirectorSlotView {
  id: string;
  description: string;
}

export interface DirectorFrictionView {
  id: string;
  description: string;
  extraObjective: string;
}

export interface DirectorAgentInput {
  language: string;
  slugline: string;
  goal: string;
  role: CharacterRoleInput;
  interlocutors: CharacterRoleInput[];
  variables: Record<string, string>;
  worldFacts: Record<string, boolean | string>;
  milestones: DirectorMilestoneView[];
  slots: DirectorSlotView[];
  focusMilestoneId: string | null;
  activeFrictions: DirectorFrictionView[];
  mode: LessonState['mode'];
  turn: number;
  maxTurns: number;
  dialogue: string;
  studentInput: string;
}

export type DirectorAgentContext = AgentContext & DirectorAgentInput;

/**
 * Base rubric augmented by any active friction attached to the milestone. This
 * is how a friction makes the SAME milestone harder without adding a new goal.
 */
function effectiveRubric(
  milestone: MilestoneDef,
  frictions: FrictionDef[],
  activeFrictionIds: string[]
): string {
  const attached = frictions.filter(
    (friction) => friction.attachesTo === milestone.id && activeFrictionIds.includes(friction.id)
  );
  if (attached.length === 0) return milestone.rubric;
  const extra = attached.map((friction) => friction.extraObjective).join('; ');
  return `${milestone.rubric} (complicated by: ${extra})`;
}

/**
 * Assemble the Director's per-turn input from authoritative state. ALL
 * milestones are injected WITH status (done ones labelled, never hidden) so the
 * Director is fully aware of settled history and never re-acknowledges it.
 */
export function buildDirectorInput(
  scenario: Scenario,
  state: LessonState,
  dialogue: string,
  studentInput: string
): DirectorAgentInput {
  const npc = scenario.characters[scenario.npcCharacterId];
  if (npc === undefined) throw new Error(`NPC ${scenario.npcCharacterId} not found in scenario.`);

  const interlocutors = Object.values(scenario.characters)
    .filter((character) => character.id !== scenario.npcCharacterId)
    .map((character) => character.role);

  const milestones: DirectorMilestoneView[] = scenario.milestones.map((milestone) => ({
    id: milestone.id,
    objective: milestone.objective,
    kind: milestone.kind,
    effectiveRubric: effectiveRubric(milestone, scenario.frictions, state.activeFrictions),
    status: state.milestones[milestone.id] ?? 'locked',
    optional: milestone.optional,
    fillsSlots: milestone.fillsSlots
  }));

  const slots: DirectorSlotView[] = scenario.slots.map((slot) => ({
    id: slot.id,
    description: slot.description
  }));

  const activeFrictions: DirectorFrictionView[] = scenario.frictions
    .filter((friction) => state.activeFrictions.includes(friction.id))
    .map((friction) => ({
      id: friction.id,
      description: friction.description,
      extraObjective: friction.extraObjective
    }));

  return {
    language: scenario.language,
    slugline: scenario.setting.slugline,
    goal: scenario.goal,
    role: npc.role,
    interlocutors,
    variables: state.variables,
    worldFacts: state.worldFacts,
    milestones,
    slots,
    focusMilestoneId: state.focusMilestoneId,
    activeFrictions,
    mode: state.mode,
    turn: state.turn,
    maxTurns: state.maxTurns,
    dialogue,
    studentInput
  };
}

const MODE_GUIDANCE: Record<LessonState['mode'], string> = {
  advance: 'Move the scene forward toward the focus milestone.',
  repair: 'The student is struggling. Simplify, and give the NPC a natural reason to re-ask or rephrase — without doing the student\'s work for them.',
  pressure: 'Turns are running low. Nudge the scene toward closing the remaining objectives.',
  deflect: 'The student went off-topic. Redirect them back into the scenario in character (e.g. a bakery does not serve pizza) without breaking immersion.'
};

export async function runDirectorAgent(input: DirectorAgentContext) {
  const {
    model,
    language,
    slugline,
    goal,
    role,
    interlocutors,
    variables,
    worldFacts,
    milestones,
    slots,
    focusMilestoneId,
    activeFrictions,
    mode,
    turn,
    maxTurns,
    dialogue,
    studentInput
  } = input;

  return streamText({
    model,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: `
          You are the hidden Director of a ${language} language-learning role-play. You do two jobs in one:
          (1) SENSE what the student's latest input accomplished, and (2) AUTHOR the next stage
          directions for the NPC. You never speak to the student directly — the Actor does that.

          CONTEXT:
          - Language: ${language}
          - Scene: ${slugline}
          - Eventual goal: ${goal}
          - NPC you direct: ${role.name} (${role.description}, gender: ${role.gender})
          - Interlocutors: ${interlocutors.map(({ name, description, gender }) => `${name} (${description}, gender: ${gender})`).join(', ')}
          - Run variables: ${JSON.stringify(variables)}
          - Established world facts (already true — NEVER contradict): ${JSON.stringify(worldFacts)}
          - Current turn ${turn} of ${maxTurns}. Directing mode: ${mode}. ${MODE_GUIDANCE[mode]}

          MILESTONES (authoritative status — obey it):
          ${milestones.map((m) => `- [${m.status}]${m.optional ? ' (optional)' : ''} ${m.id} (${m.kind}): ${m.objective} — completion: ${m.effectiveRubric}${m.fillsSlots.length > 0 ? ` — fills slots: ${m.fillsSlots.join(', ')}` : ''}`).join('\n')}
          Focus milestone: ${focusMilestoneId ?? 'none'}.

          SLOTS (facts to capture from the student when mentioned — use these EXACT ids):
          ${slots.length > 0 ? slots.map((s) => `- ${s.id}: ${s.description}`).join('\n') : 'none'}

          ${activeFrictions.length > 0 ? `ACTIVE FRICTIONS (weave in naturally; the NPC imposes these obstacles):\n${activeFrictions.map((f) => `- ${f.id}: ${f.description} → student must ${f.extraObjective}`).join('\n')}` : 'No active frictions.'}

          RULES:
          1. SENSING (observedDeltas): Evaluate the student's input against ALL milestones that are not 'done'. If the student's input satisfies a milestone's completion criteria, you MUST report it in completedMilestones immediately — even if the milestone is 'locked'. Do not withhold completions because of a milestone's status; the system safely buffers run-ahead completions.
          2. AUTHORING (stageDirections): Direct the NPC to pursue the current 'active' or 'eligible' milestone. HOWEVER, if your sensing (observedDeltas) reports that the student just completed a milestone, you MUST advance the scene by pursuing the *next* logical milestone in the list, even if it is currently labeled as 'locked'. CRITICAL: Never direct the NPC to skip over milestones (e.g., do not tell the actor to seat the guest if the seating preference milestone has not been satisfied yet).
          3. Judge completion strictly against each milestone's stated completion criteria.
             A 'student' milestone is complete the moment the STUDENT's own utterance satisfies its
             criteria — do NOT wait for the NPC to act or acknowledge first. A 'world' milestone is
             complete when the criteria about the NPC's action / world state are met (often the student
             acknowledging something the NPC did). Never delay a satisfied 'student' milestone because
             a later step hasn't happened yet.
          4. Report deltas honestly. If you are unsure a milestone was met, do NOT report it complete.
          5. Never invent milestones that are not listed. Never let the NPC do the student's job for them.
          6. For any slot you fill, use ONLY the exact slot ids listed under SLOTS above — never
             invent or rename a slot id. Set evidenceTurn to ${turn} (this turn). Do not re-fill
             slots from earlier turns.
          7. Stage directions are instructions for the NPC actor, not spoken lines. Keep them short and actionable.
          8. Respect world facts and active frictions. The NPC must stay consistent with what already happened.`
      },
      {
        role: 'user',
        content: `
          <dialogue-history>
            ${dialogue}
          </dialogue-history>

          <student-input>
            ${studentInput}
          </student-input>

          Sense what the student accomplished and author the NPC's next stage directions.`
      }
    ],
    output: Output.object({ schema: directorOutputSchema })
  });
}
