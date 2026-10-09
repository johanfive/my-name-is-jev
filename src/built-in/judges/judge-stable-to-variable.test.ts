import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { tokenize } from "../../tokenize.ts";
import type { Identifier, JudgeCtx, Kind } from "../../types.ts";
import { judgeStableToVariable } from "./judge-stable-to-variable.ts";

const fakeIdentifier = (name: string, kind: Kind = "variable"): Identifier =>
  ({ name, kind, file: "src/fake.ts", isNew: true, segments: tokenize(name) });

/**
 * Judges the name with Jev scoring its words, in order, as `scores`.
 *
 * @param t The test context the Jev mock belongs to.
 * @param id The identifier to judge.
 * @param scores Jev's score for each word it is asked about, in order.
 * @returns Whether the name passed, the words Jev was asked about, and the levels it was given.
 */
async function getJudgement(t: TestContext, id: Identifier, scores: number[] = []) {
  const jevMock = t.mock.fn(async ({ questions }: { questions: object }) =>
    Object.fromEntries(
      Object.keys(questions).map((key, i) => [key, { type: "score", score: scores[i] }]),
    ),
  );
  const ctx = { state: {}, siblings: [], jev: jevMock } as unknown as JudgeCtx;
  const verdict = await judgeStableToVariable()(id, ctx);
  const questions = Object.values(jevMock.mock.calls[0]?.arguments[0].questions ?? {});
  return {
    ok: verdict.ok,
    askedWords: questions.map((question) => question.instructions.match(/what "(.+)" stands/)[1]),
    levelCount: questions[0]?.criteria.length as unknown,
  };
}

describe("judgeStableToVariable", () => {
  test("passes a one-word name without asking Jev", async (t) => {
    const judgement = await getJudgement(t, fakeIdentifier("cache"));
    assert.deepEqual(judgement, { ok: true, askedWords: [], levelCount: undefined });
  });

  test("passes words going from stable to variable", async (t) => {
    const judgement = await getJudgement(t, fakeIdentifier("revenueTotal"), [1, 3]);
    assert.equal(judgement.ok, true);
  });

  test("fails a word more stable than the one before it", async (t) => {
    const judgement = await getJudgement(t, fakeIdentifier("totalRevenue"), [3, 1]);
    assert.equal(judgement.ok, false);
  });

  test("lets a word dip below the one before it by less than the margin", async (t) => {
    const judgement = await getJudgement(t, fakeIdentifier("totalRevenue"), [1.1, 1]);
    assert.equal(judgement.ok, true);
  });

  test("never compares the two sides of a by", async (t) => {
    const judgement = await getJudgement(t, fakeIdentifier("urlByEnvironmentDev"), [
      3,
      1,
      2,
    ]);
    assert.deepEqual(judgement, {
      ok: true,
      askedWords: [
        "url",
        "environment",
        "dev",
      ],
      levelCount: 4,
    });
  });

  test("passes without asking Jev when no side of a by has two words", async (t) => {
    const judgement = await getJudgement(t, fakeIdentifier("urlByEnvironment"));
    assert.deepEqual(judgement.askedWords, []);
  });

  test("still compares the words within one side of a by", async (t) => {
    const judgement = await getJudgement(t, fakeIdentifier("urlByDevEnvironment"), [
      1,
      3,
      1,
    ]);
    assert.equal(judgement.ok, false);
  });

  test("leaves out a function's leading verb and the stop words", async (t) => {
    const id = fakeIdentifier("getTotalOfTheRevenue", "function");
    const judgement = await getJudgement(t, id, [1, 2]);
    assert.deepEqual(judgement.askedWords, ["total", "revenue"]);
  });

  test("gives a file name one more level, for extensions", async (t) => {
    const judgement = await getJudgement(t, fakeIdentifier("user-cache.ts", "file"), [
      1,
      2,
      3,
    ]);
    assert.equal(judgement.levelCount, 5);
  });
});
