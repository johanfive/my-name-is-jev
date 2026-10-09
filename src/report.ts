import type { Finding, ResolvedConfig, Severity } from "./types.ts";

/** One decision and one text any agent can act on. Adapters map `decision` onto their protocol. */
export type Report = { decision: Severity; findings: Finding[]; text: string };

const HEADING_BY_SECTION = {
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

/** Most restrictive first. */
const SEVERITY_RANKING: Severity[] = [
  "block",
  "ask",
  "warn",
];

/**
 * Each finding's severity is its rule's, else the config default, else warn.
 * The most restrictive severity among the findings decides: block, then ask, then warn.
 * Every finding of the tool call is listed, deciding ones first,
 * so one deny or ask covers all of them and the agent's re-emit fixes everything at once.
 * When nothing blocks or asks, failed checks are stated firmly and judge verdicts as advice.
 */
export function buildReport(findings: Finding[], config: ResolvedConfig): Report | null {
  if (!findings.length) return null;
  const decision = SEVERITY_RANKING.find((severity) =>
    findings.some((finding) => severityOf(finding, config) === severity),
  )!;
  if (decision === "warn") return buildWarning(findings);
  return buildDecision(decision, findings, config);
}

/** One line per finding, written for a model to act on. */
export function formatFinding({ identifier, rule, verdict }: Finding): string {
  return [
    `${identifier.name} (${identifier.kind}, ${identifier.file}): ${endWithFullStop(rule.message)}`,
    verdict.detail && `${capitalize(verdict.detail)}.`,
    rule.example && `Example: ${rule.example}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** The finding's rule severity, else the config default. Rules override the config per rule. */
export const severityOf = (finding: Finding, config: ResolvedConfig): Severity =>
  finding.rule.severity ?? config.severity;

/** Failed checks stated firmly, then judge verdicts as advice. */
function buildWarning(findings: Finding[]): Report {
  const checked = findings.filter((finding) => finding.rule.check);
  const judged = findings.filter((finding) => finding.rule.judge);
  const checkSection = formatSection(HEADING_BY_SECTION.warnCheck, checked);
  const judgeSection = formatSection(HEADING_BY_SECTION.warnJudge, judged);
  const text = [checkSection, judgeSection].filter(Boolean).join("\n");
  return { decision: "warn", findings: [...checked, ...judged], text };
}

/** The deciding findings under their heading, then every other finding. */
function buildDecision(
  decision: Exclude<Severity, "warn">,
  findings: Finding[],
  config: ResolvedConfig,
): Report {
  const deciding = findings.filter((finding) => severityOf(finding, config) === decision);
  const rest = findings.filter((finding) => severityOf(finding, config) !== decision);
  const also = rest.length ? `\nAlso, while you are at it:\n${formatLines(rest)}` : "";
  const text = `${HEADING_BY_SECTION[decision]}\n${formatLines(deciding)}${also}`;
  return { decision, findings: [...deciding, ...rest], text };
}

/** A heading over its findings, or nothing when there are none, so empty sections drop out. */
const formatSection = (heading: string, findings: Finding[]) =>
  findings.length ? `${heading}\n${formatLines(findings)}` : "";

/** The findings as a bulleted list. */
const formatLines = (findings: Finding[]) =>
  findings.map((finding) => `- ${formatFinding(finding)}`).join("\n");

/** The text ending in a full stop. Rule messages are written by people, with or without one. */
const endWithFullStop = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

/** The text with its first letter capitalized. A verdict's detail is written as a fragment. */
const capitalize = (text: string) => `${text[0].toUpperCase()}${text.slice(1)}`;
