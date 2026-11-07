import { OPENAI_API_KEY, DIRECTOR_MODEL } from '$env/static/private';
import type { JudgeReport, SessionTrace } from '#lib/trace/types';
import {
  buildMarkdownReport,
  detectTraceInvariantViolations,
  evaluateSessionCore,
  formatTraceForJudge,
  mergeInvariantAndLlmEvaluation
} from '#lib/server/judgeCore';

const JUDGE_MODEL = process.env.JUDGE_MODEL || DIRECTOR_MODEL || 'gpt-4o-mini';

export {
  buildMarkdownReport,
  detectTraceInvariantViolations,
  evaluateSessionCore,
  formatTraceForJudge,
  mergeInvariantAndLlmEvaluation
};

export async function evaluateSession(trace: SessionTrace): Promise<JudgeReport> {
  return evaluateSessionCore(trace, {
    apiKey: OPENAI_API_KEY,
    modelName: JUDGE_MODEL
  });
}
