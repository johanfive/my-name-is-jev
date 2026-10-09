import type { Finding, ResolvedConfig, Severity } from "./types.ts";

/** One decision and one text any agent can act on. Adapters map `decision` onto their protocol. */
export type Report = { decision: Severity; findings: Finding[]; text: string };

/** One line per finding, written for a model to act on. */
export const formatFinding = (f: Finding) =>
  [
    `${f.identifier.name} (${f.identifier.kind}, ${f.identifier.file}): ${f.rule.message}${/[.!?]$/.test(f.rule.message) ? "" : "."}`,
    f.verdict.detail && `${f.verdict.detail[0].toUpperCase()}${f.verdict.detail.slice(1)}.`,
    f.rule.example && `Example: ${f.rule.example}.`,
  ]
    .filter(Boolean)
    .join(" ");

const HEADING = {
  block: "Naming convention violations. Rename and retry:",
  ask: "Naming convention concerns:",
  /** A failed check is a fact about the name's shape. */
  warnCheck: "Naming convention warnings (not blocking; fix these next time you touch the code):",
  /** A judge's verdict is a probability, and the agent knows the code better than Jev does. */
  warnJudge:
    "Naming suggestions (not blocking). Each one is a second opinion, not a verdict: "
    + "weigh it against what you know about the code, then rename, add a word, "
    + "or keep the name when it follows a convention this codebase already uses:",
};

const RANK: Severity[] = [
  "block",
  "ask",
  "warn",
];
const lines = (fs: Finding[]) => fs.map((f) => `- ${formatFinding(f)}`).join("\n");
const section = (heading: string, fs: Finding[]) =>
  fs.length ? `${heading}\n${lines(fs)}` : "";

/**
 * Each finding's severity is its rule's, else the config default, else warn.
 * The most restrictive severity among the findings decides: block, then ask, then warn.
 * Every finding of the tool call is listed, deciding ones first,
 * so one deny or ask covers all of them and the agent's re-emit fixes everything at once.
 * When nothing blocks or asks, failed checks are stated firmly and judge verdicts as advice.
 */
export function buildReport(findings: Finding[], config: ResolvedConfig): Report | null {
  if (!findings.length) return null;
  const severityOf = (f: Finding): Severity => f.rule.severity ?? config.severity;
  const decision = RANK.find((s) => findings.some((f) => severityOf(f) === s))!;
  if (decision === "warn") {
    const checked = findings.filter((f) => f.rule.check);
    const judged = findings.filter((f) => f.rule.judge);
    const text = [section(HEADING.warnCheck, checked), section(HEADING.warnJudge, judged)]
      .filter(Boolean)
      .join("\n");
    return { decision, findings: [...checked, ...judged], text };
  }
  const deciding = findings.filter((f) => severityOf(f) === decision);
  const rest = findings.filter((f) => severityOf(f) !== decision);
  const also = rest.length ? `\nAlso, while you are at it:\n${lines(rest)}` : "";
  const text = `${HEADING[decision]}\n${lines(deciding)}${also}`;
  return { decision, findings: [...deciding, ...rest], text };
}
