import type { EntryType, NoulQuestion } from "@typesafe-ai/sdk";
import { question } from "../../question.ts";
import type { Judge } from "../../types.ts";
import { describeConfidence } from "./helpers/describe-confidence.ts";

/**
 * A judge that asks one yes/no question about the identifier.
 * Fails when the answer is `failWhen` past `threshold`.
 */
export function judgeByNoul({
  ask,
  criteria,
  threshold = 0.5,
  failWhen = "yes",
}: {
  ask: EntryType;
  criteria?: NoulQuestion["criteria"];
  threshold?: number;
  failWhen?: "yes" | "no";
}): Judge {
  return async (_id, ctx) => {
    const answers = await ctx.jev({ questions: { q: question.noul(ask, criteria) } });
    if (answers.q.type !== "noul") return { ok: true };
    const probability = answers.q.noul;
    const fails = failWhen === "yes" ? probability > threshold : probability < threshold;
    if (!fails) return { ok: true };
    return {
      ok: false,
      detail: describeConfidence(failWhen === "yes" ? probability : 1 - probability),
    };
  };
}
