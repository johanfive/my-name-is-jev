import type { Question } from "@typesafe-ai/sdk";
import { question } from "../../question.ts";
import type { Judge } from "../../types.ts";

const VERSIONISH = /^v?\d+(\.\d+)*$/;
/** Function words carry no stability of their own; they are neither asked about nor compared. */
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "to",
  "for",
  "by",
  "with",
  "and",
  "or",
  "in",
  "on",
  "at",
  "from",
  "as",
  "is",
]);

/**
 * Words in a name go from most stable to most variable along `scale`.
 * One score per word, compared in code.
 * Digits and versions are pinned to the last level without asking Jev.
 * In a file name, Jev is also asked per word whether it is an extension
 * or tool suffix (`test`, `d`, `ts`); those words are left out of the comparison.
 * A dot alone cannot tell `the-thing.test.ts` from `com.google.event`, so this is Jev's call.
 * The finding names the misplaced pair; it never proposes an order.
 */
export const ordered =
  ({
    scale,
    minSegments = 3,
    margin = 0.75,
  }: {
    scale: readonly [string, string, ...string[]];
    minSegments?: number;
    margin?: number;
  }): Judge =>
    async (id, ctx) => {
      const all = id.segments.filter((s) => !STOP_WORDS.has(s));
      if (all.length < minSegments) return { ok: true };
      const last = scale.length - 1;
      const questions: Record<string, Question> = {};
      all.forEach((s, i) => {
        if (!VERSIONISH.test(s)) {
          questions[`s${i}`] = question.score(
            `Where on this scale does the word "${s}" sit in the name "${id.name}"?`,
            scale,
          );
        }
        if (id.kind === "file") {
          questions[`x${i}`] = question.noul(
            `In the file name "${id.name}" (path in file), is "${s}" a file extension `
            + `or a tool suffix rather than a word the author chose as part of the name?`,
            {
              true: "ts, js, json, md, test, spec, d, config, stories",
              false: "user, cache, fetch, com, google, event, signup, request",
            },
          );
        }
      });
      const a = Object.keys(questions).length ? await ctx.jev({ questions }) : {};
      const isExt = (i: number) => {
        const x = a[`x${i}`];
        return x?.type === "noul" && x.noul >= 0.5;
      };
      const scoreOf = (i: number) => {
        const s = a[`s${i}`];
        return s?.type === "score" ? s.score : 0;
      };
      const words = all.filter((_, i) => !isExt(i));
      const scores = all.flatMap((s, i) =>
        isExt(i) ? [] : [VERSIONISH.test(s) ? last : scoreOf(i)],
      );
      for (let i = 1; i < scores.length; i++) {
        if (scores[i] < scores[i - 1] - margin) {
          return {
            ok: false,
            detail:
              `"${words[i - 1]}" (${scale[Math.round(scores[i - 1])]}) `
              + `comes before "${words[i]}" (${scale[Math.round(scores[i])]})`,
          };
        }
      }
      return { ok: true };
    };
