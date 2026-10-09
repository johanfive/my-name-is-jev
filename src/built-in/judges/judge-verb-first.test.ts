import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { tokenize } from "../../tokenize.ts";
import type { Identifier, JudgeCtx } from "../../types.ts";
import { judgeVerbFirst } from "./judge-verb-first.ts";

const fakeFunction = (name: string): Identifier =>
  ({ name, kind: "function", file: "src/fake.ts", isNew: true, segments: tokenize(name) });

/**
 * Judges the function name with Jev answering each question with a fixed probability.
 *
 * @param t The test context the Jev mock belongs to.
 * @param name The function name.
 * @param probabilityByQuestion Jev's answer to each question it may be asked.
 * @returns Whether the name passed, the verdict's detail, and the questions Jev was asked.
 */
async function getJudgement(
  t: TestContext,
  name: string,
  probabilityByQuestion: Record<string, number>,
) {
  const jevMock = t.mock.fn(async ({ questions }: { questions: object }) =>
    Object.fromEntries(
      Object.keys(questions).map((key) => {
        const answer = { type: "noul", noul: probabilityByQuestion[key] };
        return [key, answer];
      }),
    ),
  );
  const ctx = { state: {}, siblings: [], jev: jevMock } as unknown as JudgeCtx;
  const verdict = await judgeVerbFirst()(fakeFunction(name), ctx);
  return {
    ok: verdict.ok,
    detail: verdict.ok ? undefined : verdict.detail,
    asked: Object.keys(jevMock.mock.calls[0].arguments[0].questions),
  };
}

describe("judgeVerbFirst", () => {
  test("passes a name that reads only as a command", async (t) => {
    const judgement = await getJudgement(t, "fetchUser", { nounPhrase: 0.1, objectIsAction: 0.1 });
    assert.equal(judgement.ok, true);
  });

  test("fails a name that reads as a thing, naming that reading", async (t) => {
    const judgement = await getJudgement(t, "displayName", { nounPhrase: 0.9, objectIsAction: 0 });
    assert.equal(judgement.ok, false);
    assert.match(String(judgement.detail), /"the display name" \(90% sure\)/);
  });

  test("fails a name whose object reads as an action, naming the object", async (t) => {
    const judgement = await getJudgement(t, "getBuild", { nounPhrase: 0.1, objectIsAction: 0.7 });
    assert.equal(judgement.ok, false);
    assert.match(String(judgement.detail), /^"build" can be read as an action/);
  });

  test("asks about the object only when there is one", async (t) => {
    const judgement = await getJudgement(t, "run", { nounPhrase: 0.1 });
    assert.deepEqual(judgement.asked, ["nounPhrase"]);
  });
});
