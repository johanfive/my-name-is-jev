import type { EntryType, ScoreCriteria } from "@typesafe-ai/sdk";
import { question } from "../../question.ts";
import type { Judge } from "../../types.ts";

/**
 * A judge that scores the identifier along `legend`.
 * Fails when the score leaves `[min, max]`.
 */
export function judgeByScore({
  ask,
  legend,
  min = -Infinity,
  max = Infinity,
}: {
  ask: EntryType;
  legend: ScoreCriteria;
  min?: number;
  max?: number;
}): Judge {
  return async (_id, ctx) => {
    const answers = await ctx.jev({ questions: { q: question.score(ask, legend) } });
    if (answers.q.type !== "score") return { ok: true };
    const score = answers.q.score;
    if (score < min || score > max) {
      const label = String(legend[Math.round(score)]);
      return { ok: false, detail: `scores ${score.toFixed(1)} (${label})` };
    }
    return { ok: true };
  };
}
