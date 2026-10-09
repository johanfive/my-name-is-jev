import type { Question, ScoreCriteria } from "@typesafe-ai/sdk";
import { question } from "../../question.ts";
import type { Identifier, Judge } from "../../types.ts";

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
 * How often what a word stands for changes, from never to every time.
 * Each level is an answer to the question Jev is asked;
 * the words in brackets illustrate it and are not a list Jev matches against.
 * Two words on the same level are never compared:
 * which of two things is the more stable depends on context only the author has.
 */
const LEVELS = [
  "it stays the same for everything made here: who it all belongs to, "
  + "such as a company or an organisation (acme, google)",
  "it names the thing itself, and stays the same for as long as the thing exists "
  + "(billing, invoice, cache, handler)",
  "it says which copy or variant of the thing this is: the same thing exists in several "
  + "(dev, prod, primary, legacy)",
  "it changes every time the thing is made or moves on: a version, a date, a state "
  + "(v2, 20260301, draft, pending)",
] as const;
/** Where Jev puts `test`, `d` and `ts` in a file name: after everything else. */
const EXTENSION_LEVEL =
  "not part of the name: a file extension or tool suffix (js, ts, json, test, spec, d)";

/**
 * A judge that words in a name go from most stable to most variable:
 * the owner, then the thing, then which copy of it, then what changes every time
 * (`acme-billing-dev-20260301093000`).
 * Jev is asked, per word, how likely to change the thing it stands for is.
 * The comparison is done in code: Jev places one word well and compares two words badly.
 * A map is named `<value>By<key>`: each side of a `by` is ordered on its own,
 * never against the other.
 * Two words are enough to be out of order (`totalRevenue`).
 * A file name gets one more level, for extensions and tool suffixes:
 * a dot alone cannot tell `the-thing.test.ts` from `com.google.event`, so this is Jev's call.
 * The verdict carries no detail: the rule's message states the convention
 * and the agent, who knows the context, works out what to do with it.
 */
export function judgeStableToVariable({ segmentsMin = 2, margin = 0.2 } = {}): Judge {
  return async (id, ctx) => {
    const sides = listSidesToPlace(id);
    if (sides.every((side) => side.length < segmentsMin)) return { ok: true };
    const words = sides.flat();
    const sideIndexes = sides.flatMap((side, sideIndex) => side.map(() => sideIndex));
    const levels = id.kind === "file" ? [...LEVELS, EXTENSION_LEVEL] as const : LEVELS;
    const answers = await ctx.jev({ questions: askLevels(id.name, words, levels) });
    const scores = words.map((_, i) => {
      const answer = answers[`s${i}`];
      return answer?.type === "score" ? answer.score : 0;
    });
    return { ok: isOrdered(scores, sideIndexes, margin) };
  };
}

/**
 * The words whose level matters, split into the sides of each `by`.
 * A function's leading verb is left out: it is the action, not part of the thing named.
 */
function listSidesToPlace(id: Identifier): string[][] {
  const isCallable = id.kind === "function" || id.kind === "method";
  return splitAtBy(isCallable ? id.segments.slice(1) : id.segments);
}

/**
 * The words of a name, split into the sides of each `by`, stop words left out.
 * `urlByEnvironment` reads as a map from environment to url, so its two sides never compare.
 */
function splitAtBy(segments: string[]): string[][] {
  const sides: string[][] = [[]];
  for (const segment of segments) {
    if (segment === "by") sides.push([]);
    else if (!STOP_WORDS.has(segment)) sides.at(-1)!.push(segment);
  }
  return sides;
}

/** One question per word, keyed by its position so the answers line up with the words. */
function askLevels(name: string, words: string[], levels: ScoreCriteria) {
  return Object.fromEntries(
    words.map((word, i): [string, Question] => {
      const ask = `In the name "${name}", how likely to change is what "${word}" stands for?`;
      return [`s${i}`, question.score(ask, levels)];
    }),
  );
}

/**
 * Each score at least the previous one on the same side, less `margin`:
 * Jev's placements are noisy, and the two sides of a `by` never compare.
 */
function isOrdered(scores: number[], sideIndexes: number[], margin: number): boolean {
  return scores.every(
    (score, i) =>
      i === 0 || sideIndexes[i] !== sideIndexes[i - 1] || score >= scores[i - 1] - margin,
  );
}
