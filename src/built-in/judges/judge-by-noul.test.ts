import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import type { Identifier, JudgeCtx, Verdict } from "../../types.ts";
import { judgeByNoul } from "./judge-by-noul.ts";

const fakeIdentifier: Identifier =
  { name: "userCache", kind: "variable", file: "src/fake.ts", isNew: true, segments: [] };

/**
 * Judges the identifier with Jev answering the yes/no question with `probability`.
 *
 * @param t The test context the Jev mock belongs to.
 * @param probability Jev's answer.
 * @param options The judge's options, besides the question.
 * @returns The verdict.
 */
async function getVerdict(
  t: TestContext,
  probability: number,
  options: { threshold?: number; failWhen?: "yes" | "no" } = {},
): Promise<Verdict> {
  const jevMock = t.mock.fn(async () => ({ q: { type: "noul", noul: probability } }));
  const ctx = { state: {}, siblings: [], jev: jevMock } as unknown as JudgeCtx;
  return judgeByNoul({ ask: "Is it vague?", ...options })(fakeIdentifier, ctx);
}

describe("judgeByNoul", () => {
  test("fails a yes past the threshold, saying how sure Jev is", async (t) => {
    const verdict = await getVerdict(t, 0.8);
    assert.deepEqual(verdict, { ok: false, detail: "80% sure" });
  });

  test("passes a yes under the threshold", async (t) => {
    const verdict = await getVerdict(t, 0.3);
    assert.deepEqual(verdict, { ok: true });
  });

  test("fails a no past the threshold when told to fail on no", async (t) => {
    const verdict = await getVerdict(t, 0.2, { failWhen: "no" });
    assert.deepEqual(verdict, { ok: false, detail: "80% sure" });
  });

  test("uses the threshold it is given", async (t) => {
    const verdict = await getVerdict(t, 0.8, { threshold: 0.9 });
    assert.deepEqual(verdict, { ok: true });
  });
});
