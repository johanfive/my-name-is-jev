import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resolveConfig } from "./config.ts";
import { buildReport, formatFinding } from "./report.ts";
import type { Finding, Rule, Severity } from "./types.ts";

const fakeIdentifier = {
  name: "userCache",
  kind: "variable" as const,
  file: "src/fake.ts",
  isNew: true,
  segments: ["user", "cache"],
};

const fakeFinding = (
  id: string,
  { severity, type = "check" }: { severity?: Severity; type?: "check" | "judge" } = {},
): Finding => {
  const base = { id, message: `${id} message`, severity };
  const rule: Rule = type === "check"
    ? { ...base, check: () => ({ ok: true }) }
    : { ...base, judge: async () => ({ ok: true }) };
  return { rule, identifier: fakeIdentifier, verdict: { ok: false } };
};

/**
 * Builds the report for the findings under a config whose default severity is `severity`.
 *
 * @param findings The findings of one tool call.
 * @param options The config's default severity, and whether the write already landed.
 * @returns The decision, the rule ids in report order, the heading over the agent's text
 *   and the human's summary, or null for no report.
 */
function getReportOutline(
  findings: Finding[],
  { severity = "warn", isWritten = false }: { severity?: Severity; isWritten?: boolean } = {},
) {
  const report = buildReport(findings, resolveConfig({ rules: [], severity }), { isWritten });
  return report && {
    decision: report.decision,
    ruleIds: report.findings.map((finding) => finding.rule.id),
    heading: report.text.split("\n")[0],
    summary: report.summary,
  };
}

describe("buildReport", () => {
  test("returns null without findings", () => {
    const outline = getReportOutline([]);
    assert.equal(outline, null);
  });

  test("decides by the most restrictive severity, listing deciding findings first", () => {
    const findings = [
      fakeFinding("warned"),
      fakeFinding("asked", { severity: "ask" }),
      fakeFinding("blocked", { severity: "block" }),
    ];
    const outline = getReportOutline(findings);
    assert.equal(outline?.decision, "deny");
    assert.deepEqual(outline?.ruleIds, [
      "blocked",
      "warned",
      "asked",
    ]);
  });

  test("falls back to the config's severity for a rule without one", () => {
    const outline = getReportOutline([fakeFinding("plain")], { severity: "ask" });
    assert.equal(outline?.decision, "ask");
  });

  test("lists the rest under a heading of their own when something blocks", () => {
    const findings = [fakeFinding("blocked", { severity: "block" }), fakeFinding("warned")];
    const text = buildReport(findings, resolveConfig({ rules: [] }))?.text;
    assert.match(String(text), /^Naming convention violations\. Rename and retry:\n- .*blocked/);
    assert.match(String(text), /\nAlso, while you are at it:\n- .*warned/);
  });

  test("puts failed checks before judge verdicts in a warning, under separate headings", () => {
    const findings = [fakeFinding("judged", { type: "judge" }), fakeFinding("checked")];
    const report = buildReport(findings, resolveConfig({ rules: [] }));
    const headings = report?.text.split("\n").filter((line) => !line.startsWith("- "));
    assert.deepEqual(report?.findings.map((finding) => finding.rule.id), ["checked", "judged"]);
    assert.match(String(headings?.[0]), /^Naming convention warnings/);
    assert.match(String(headings?.[1]), /^Naming suggestions/);
  });

  test("counts the warnings for the human", () => {
    const outline = getReportOutline([fakeFinding("first"), fakeFinding("second")]);
    assert.equal(outline?.summary, "nij: 2 naming warnings");
  });

  describe("once the write landed", () => {
    test("turns a block into a fix: the agent renames, the human is told", () => {
      const findings = [fakeFinding("blocked", { severity: "block" }), fakeFinding("warned")];
      const outline = getReportOutline(findings, { isWritten: true });
      assert.deepEqual(outline, {
        decision: "fix",
        ruleIds: ["blocked", "warned"],
        heading: "Naming convention violations, already on disk. Rename them before moving on:",
        summary: "nij: 1 naming violation landed; the agent is told to rename.",
      });
    });

    test("turns an ask into a warning that names the unasked to the human", () => {
      const findings = [fakeFinding("asked", { severity: "ask" }), fakeFinding("warned")];
      const outline = getReportOutline(findings, { isWritten: true });
      assert.equal(outline?.decision, "warn");
      assert.equal(
        outline?.summary,
        "nij: 2 naming warnings. Landed without asking you: userCache (variable, src/fake.ts)",
      );
    });
  });
});

describe("formatFinding", () => {
  test("ends the message, capitalizes the detail and adds the example", () => {
    const finding = fakeFinding("rule");
    finding.verdict = { ok: false, detail: "not camel case" };
    finding.rule.example = "fetchUser";
    const line = formatFinding(finding);
    assert.equal(
      line,
      "userCache (variable, src/fake.ts): rule message. Not camel case. Example: fetchUser.",
    );
  });

  test("keeps a message's own final punctuation", () => {
    const finding = fakeFinding("rule");
    finding.rule.message = "Is this right?";
    const line = formatFinding(finding);
    assert.equal(line, "userCache (variable, src/fake.ts): Is this right?");
  });
});
