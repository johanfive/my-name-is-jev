import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import type { Identifier, JudgeCtx, Verdict } from "../../types.ts";
import { judgeByScore } from "./judge-by-score.ts";

const fakeIdentifier: Identifier =
  { name: "userCache", kind: "variable", file: "src/fake.ts", isNew: true, segments: [] };
const legend = [
  "vague",
  "fair",
  "precise",
] as const;

/**
 * Judges the identifier with Jev giving it `score` along the legend.
 *
 * @param t The test context the Jev mock belongs to.
 * @param score Jev's score.
 * @returns The verdict of a judge that accepts scores from 1 up.
 */
async function getVerdict(t: TestContext, score: number): Promise<Verdict> {
  const jevMock = t.mock.fn(async () => ({ q: { type: "score", score } }));
  const ctx = { state: {}, siblings: [], jev: jevMock } as unknown as JudgeCtx;
  return judgeByScore({ ask: "How precise is it?", legend, min: 1 })(fakeIdentifier, ctx);
}

describe("judgeByScore", () => {
  test("passes a score inside the range", async (t) => {
    const verdict = await getVerdict(t, 1.6);
    assert.deepEqual(verdict, { ok: true });
  });

  test("fails a score outside the range, naming the nearest legend entry", async (t) => {
    const verdict = await getVerdict(t, 0.4);
    assert.deepEqual(verdict, { ok: false, detail: "scores 0.4 (vague)" });
  });
});
