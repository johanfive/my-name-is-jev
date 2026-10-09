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
 * @param severity The config's default severity.
 * @returns The decision and the rule ids in report order, or null for no report.
 */
function getReportOutline(findings: Finding[], severity: Severity = "warn") {
  const report = buildReport(findings, resolveConfig({ rules: [], severity }));
  return report && {
    decision: report.decision,
    ruleIds: report.findings.map((finding) => finding.rule.id),
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
    assert.deepEqual(outline, { decision: "block", ruleIds: [
      "blocked",
      "warned",
      "asked",
    ] });
  });

  test("falls back to the config's severity for a rule without one", () => {
    const outline = getReportOutline([fakeFinding("plain")], "ask");
    assert.deepEqual(outline, { decision: "ask", ruleIds: ["plain"] });
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
