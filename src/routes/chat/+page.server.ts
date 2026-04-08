import type { Screenplay } from '$lib/screenplay/screenplay';

import type { PageServerLoad } from './$types';

import lesson001 from '$lib/lessons/lesson-001.json' with { type: 'json' };

export const load: PageServerLoad = async ({ params }) => {
  return {
    screenplay: lesson001 as Screenplay
  }
};
