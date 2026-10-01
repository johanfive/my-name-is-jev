import { question } from "../../question.ts";
import type { Judge } from "../../types.ts";
import { describeConfidence } from "./helpers/describe-confidence.ts";
import type { EntryType, NoulQuestion } from "@typesafe-ai/sdk";

/**
 * One yes/no question about the identifier, one verdict.
 * Fails when the answer is `failWhen` past `threshold`.
 */
export const noul =
  ({
    ask,
    criteria,
    threshold = 0.5,
    failWhen = "yes",
  }: {
    ask: EntryType;
    criteria?: NoulQuestion["criteria"];
    threshold?: number;
    failWhen?: "yes" | "no";
  }): Judge =>
    async (_id, ctx) => {
      const a = await ctx.jev({ questions: { q: question.noul(ask, criteria) } });
      if (a.q.type !== "noul") return { ok: true };
      const p = a.q.noul;
      const fail = failWhen === "yes" ? p > threshold : p < threshold;
      return fail
        ? { ok: false, detail: describeConfidence(failWhen === "yes" ? p : 1 - p) }
        : { ok: true };
    };
