import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { runRules } from "./pipeline.ts";
import type { Identifier, JudgeCtx, Rule, Verdict } from "./types.ts";

const fakeIdentifier: Identifier = {
  name: "userCache",
  kind: "variable",
  file: "src/fake.ts",
  isNew: true,
  segments: ["user", "cache"],
};
const fakeJudgeCtx = { state: {}, siblings: [], jev: async () => ({}) } as JudgeCtx;
const fail: Verdict = { ok: false, detail: "bad" };
const pass: Verdict = { ok: true };

const mockCheckRule = (t: TestContext, id: string, verdict: Verdict) =>
  ({ id, message: id, check: t.mock.fn(() => verdict) }) satisfies Rule;
const mockJudgeRule = (t: TestContext, id: string, verdict: Verdict) =>
  ({ id, message: id, judge: t.mock.fn(async () => verdict) }) satisfies Rule;
const mockThrowingRule = (t: TestContext, type: "check" | "judge"): Rule => {
  const throwBoom = t.mock.fn(() => {
    throw new Error("boom");
  });
  return type === "check"
    ? { id: "broken", message: "", check: throwBoom }
    : { id: "broken", message: "", judge: async () => throwBoom() };
};

/**
 * Runs the rules over the identifiers, with Jev available, and returns the failing rule ids.
 *
 * @param rules The rules to run.
 * @param identifiers The identifiers of one tool call.
 * @returns The rule id of each finding, in order.
 */
async function getFailedRuleIds(rules: Rule[], identifiers = [fakeIdentifier]): Promise<unknown[]> {
  const findings = await runRules(rules, identifiers, () => fakeJudgeCtx);
  return findings.map((finding) => finding.rule.id);
}

describe("runRules", () => {
  test("keeps every failed check", async (t) => {
    const rules = [
      mockCheckRule(t, "first", fail),
      mockCheckRule(t, "second", pass),
      mockCheckRule(t, "third", fail),
    ];
    const failedRuleIds = await getFailedRuleIds(rules);
    assert.deepEqual(failedRuleIds, ["first", "third"]);
  });

  test("skips every judge once a check fails", async (t) => {
    const judgeRule = mockJudgeRule(t, "judge", fail);
    await getFailedRuleIds([mockCheckRule(t, "check", fail), judgeRule]);
    assert.equal(judgeRule.judge.mock.callCount(), 0);
  });

  test("runs the judges when every check passes", async (t) => {
    const rules = [mockCheckRule(t, "check", pass), mockJudgeRule(t, "judge", fail)];
    const failedRuleIds = await getFailedRuleIds(rules);
    assert.deepEqual(failedRuleIds, ["judge"]);
  });

  test("skips the judges without Jev", async (t) => {
    const judgeRule = mockJudgeRule(t, "judge", fail);
    const findings = await runRules([judgeRule], [fakeIdentifier], null);
    assert.deepEqual(findings, []);
  });

  test("checks only new identifiers", async (t) => {
    const checkRule = mockCheckRule(t, "check", fail);
    await getFailedRuleIds([checkRule], [{ ...fakeIdentifier, isNew: false }]);
    assert.equal(checkRule.check.mock.callCount(), 0);
  });

  test("applies a rule only to the kinds it selects", async (t) => {
    const select = { kind: ["function" as const] };
    const rule = { ...mockCheckRule(t, "functions", fail), select };
    const failedRuleIds = await getFailedRuleIds([rule]);
    assert.deepEqual(failedRuleIds, []);
  });

  test("gives a check the other identifiers of the call as siblings", async (t) => {
    const checkRule = mockCheckRule(t, "check", pass);
    const sibling = { ...fakeIdentifier, name: "userStore" };
    await getFailedRuleIds([checkRule], [fakeIdentifier, sibling]);
    const siblings = checkRule.check.mock.calls[0].arguments.at(1);
    assert.deepEqual(siblings, { siblings: [sibling] });
  });

  describe("skips and logs a rule that throws", () => {
    test("in a check", async (t) => {
      const stderrMock = t.mock.method(process.stderr, "write", () => true);
      const rules = [mockThrowingRule(t, "check"), mockCheckRule(t, "next", fail)];
      const failedRuleIds = await getFailedRuleIds(rules);
      const logged = String(stderrMock.mock.calls[0].arguments[0]);
      assert.deepEqual(failedRuleIds, ["next"]);
      assert.match(logged, /rule broken skipped on userCache: boom/);
    });

    test("in a judge", async (t) => {
      const stderrMock = t.mock.method(process.stderr, "write", () => true);
      const rules = [mockThrowingRule(t, "judge"), mockJudgeRule(t, "next", fail)];
      const failedRuleIds = await getFailedRuleIds(rules);
      const logged = String(stderrMock.mock.calls[0].arguments[0]);
      assert.deepEqual(failedRuleIds, ["next"]);
      assert.match(logged, /rule broken skipped on userCache: boom/);
    });
  });
});
