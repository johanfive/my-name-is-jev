import type { Question } from "@typesafe-ai/sdk";
import { question } from "../../question.ts";
import type { Judge } from "../../types.ts";

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
 * Words in a name go from most stable to most variable:
 * the owner, then the thing, then which copy of it, then what changes every time
 * (`acme-billing-dev-20260301093000`).
 * Jev is asked, per word, how likely to change the thing it stands for is.
 * The comparison is done in code: Jev places one word well and compares two words badly.
 * A function's leading verb is left out: it is the action, not part of the thing named.
 * A file name gets one more level, for extensions and tool suffixes:
 * a dot alone cannot tell `the-thing.test.ts` from `com.google.event`, so this is Jev's call.
 * The verdict carries no detail: the rule's message states the convention
 * and the agent, who knows the context, works out what to do with it.
 */
export const ordered =
  ({ minSegments = 3, margin = 0.2 } = {}): Judge =>
    async (id, ctx) => {
      const isCallable = id.kind === "function" || id.kind === "method";
      const words = (isCallable ? id.segments.slice(1) : id.segments).filter(
        (s) => !STOP_WORDS.has(s),
      );
      if (words.length < minSegments) return { ok: true };
      const levels = id.kind === "file" ? [...LEVELS, EXTENSION_LEVEL] as const : LEVELS;
      const questions: Record<string, Question> = {};
      words.forEach((s, i) => {
        questions[`s${i}`] = question.score(
          `In the name "${id.name}", how likely to change is what "${s}" stands for?`,
          levels,
        );
      });
      const a = await ctx.jev({ questions });
      const scores = words.map((_, i) => {
        const s = a[`s${i}`];
        return s?.type === "score" ? s.score : 0;
      });
      return { ok: scores.every((s, i) => i === 0 || s >= scores[i - 1] - margin) };
    };
