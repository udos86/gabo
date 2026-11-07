import { describe, expect, it } from 'vitest';

import cafeRaw from '#lib/lessons/cafe-001.json';
import { scenarioSchema } from '#lib/scenario/scenario';
import type { LessonState } from '#lib/scenario/state';
import { buildDirectorInput, buildDirectorMessages } from '#lib/ai/director';
import goldenTurnsRaw from '#lib/ai/golden-turns.json';

interface GoldenTurnExpectation {
  completedMilestonesIncludes?: string[];
  completedMilestonesExcludes?: string[];
  filledSlots?: Record<string, string>;
  stageDirectionsMustNotMatch?: string[];
}

interface GoldenTurnCase {
  id: string;
  description: string;
  scenarioId: string;
  state: LessonState;
  dialogue: string;
  studentInput: string;
  expect: GoldenTurnExpectation;
}

const cafeScenario = scenarioSchema.parse(cafeRaw);
const goldenTurns = goldenTurnsRaw as unknown as GoldenTurnCase[];

describe('Director Prompt & Golden Turns Regression Guard', () => {
  it('validates all golden turn cases against cafe-001 schema ids', () => {
    expect(goldenTurns.length).toBeGreaterThanOrEqual(7);

    const validMilestoneIds = new Set(cafeScenario.milestones.map((m) => m.id));
    const validSlotIds = new Set(cafeScenario.slots.map((s) => s.id));
    const validFrictionIds = new Set(cafeScenario.frictions.map((f) => f.id));

    for (const tc of goldenTurns) {
      expect(tc.scenarioId).toBe('cafe-001');

      for (const mId of Object.keys(tc.state.milestones)) {
        expect(validMilestoneIds.has(mId)).toBe(true);
      }
      for (const fId of tc.state.activeFrictions) {
        expect(validFrictionIds.has(fId)).toBe(true);
      }
      for (const mId of tc.expect.completedMilestonesIncludes ?? []) {
        expect(validMilestoneIds.has(mId)).toBe(true);
      }
      for (const mId of tc.expect.completedMilestonesExcludes ?? []) {
        expect(validMilestoneIds.has(mId)).toBe(true);
      }
      for (const sId of Object.keys(tc.expect.filledSlots ?? {})) {
        expect(validSlotIds.has(sId)).toBe(true);
      }
    }
  });

  it('preserves critical anti-regression rules in Director system prompt', () => {
    const turn2 = goldenTurns.find((t) => t.id === 'turn2-combined-greet-and-table')!;
    const input = buildDirectorInput(cafeScenario, turn2.state, turn2.dialogue, turn2.studentInput);
    const { systemMessage } = buildDirectorMessages(input);
    const content = String(systemMessage.content);

    // 1. Guards against commit eaf8f52 regression: must explicitly cover combined mandatory milestones AND optional milestones
    expect(content).toContain('greeting and requesting a table together');
    expect(content).toContain('optional milestone');

    // 2. Guards against filling a milestone's slot (party_size) without checking/reporting the milestone (request_table)
    expect(content).toContain('Whenever you fill a slot required by a milestone');

    // 3. Guards against Sensing-Authoring Split-Brain
    expect(content).toContain('keep stageDirections strictly synchronized with completedMilestones');
  });

  it('augments choose_location rubric when terrace_full friction is active', () => {
    const turn4 = goldenTurns.find((t) => t.id === 'turn4-request-outside-triggers-terrace-full-friction')!;
    const input = buildDirectorInput(cafeScenario, turn4.state, turn4.dialogue, turn4.studentInput);
    const chooseLocation = input.milestones.find((m) => m.id === 'choose_location')!;

    expect(chooseLocation.effectiveRubric).toContain('To complete this milestone, the student MUST accept a table inside instead, or politely ask to wait.');
    expect(chooseLocation.effectiveRubric).toContain('Do NOT mark as completed until they fulfill this requirement.');
  });

  it('ensures milestones with npcAssumption allow accepting the NPC assumption in their base rubric', () => {
    for (const milestone of cafeScenario.milestones) {
      if (milestone.npcAssumption) {
        expect(milestone.rubric.toLowerCase()).toMatch(/accept|adapt/);
      }
    }
  });
});

