import { scenarioSchema, type Scenario } from '$lib/scenario/scenario';

import type { PageServerLoad } from './$types';

import cafe001 from '$lib/lessons/cafe-001.json' with { type: 'json' };

export const load: PageServerLoad = async () => {
  return {
    scenario: scenarioSchema.parse(cafe001) satisfies Scenario
  };
};
