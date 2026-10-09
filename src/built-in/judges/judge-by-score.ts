import { question } from "../../question.ts";
import type { Judge } from "../../types.ts";
import type { EntryType, ScoreCriteria } from "@typesafe-ai/sdk";

/**
 * One scored question about the identifier along `legend`, one verdict.
 * Fails when the score leaves `[min, max]`.
 */
export const judgeByScore =
  ({
    ask,
    legend,
    min = -Infinity,
    max = Infinity,
  }: {
    ask: EntryType;
    legend: ScoreCriteria;
    min?: number;
    max?: number;
  }): Judge =>
    async (_id, ctx) => {
      const a = await ctx.jev({ questions: { q: question.score(ask, legend) } });
      if (a.q.type !== "score") return { ok: true };
      const s = a.q.score;
      return s < min || s > max
        ? { ok: false, detail: `scores ${s.toFixed(1)} (${String(legend[Math.round(s)])})` }
        : { ok: true };
    };
