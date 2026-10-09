import type { Finding, ResolvedConfig, Severity } from "./types.ts";

/**
 * What nij can do about the findings: deny the write, ask the human, warn,
 * or require a fix when a blocking violation is already on disk and the agent has to rename it.
 */
export type Outcome = "deny" | "ask" | "requireFix" | "warn";
/**
 * One decision and one text any agent can act on. Adapters map `decision` onto their protocol.
 * `summary` is one line for the human, when the agent's text does not reach them.
 */
export type Report = { decision: Outcome; findings: Finding[]; text: string; summary?: string };

const HEADING_BY_SECTION = {
  deny: "Naming convention violations. Rename and retry:",
  requireFix: "Naming convention violations, already on disk. Rename them before moving on:",
  ask: "Naming convention concerns:",
  /** A failed check is a fact about the name's shape. */
  warnCheck: "Naming convention warnings (not blocking; fix these next time you touch the code):",
  /** A judge's verdict is a probability, and the agent knows the code better than Jev does. */
  warnJudge:
    "Naming suggestions (not blocking). Each one is a second opinion, not a verdict: "
    + "weigh it against what you know about the code, then rename, add a word, "
    + "or keep the name when it follows a convention this codebase already uses:",
};

/**
 * Why a block or ask did not stop the write, for a human who set that severity and
 * sees the name on disk anyway.
 */
const WRITTEN_UNSEEN = "written in a way nij can only check after the fact";

/** Most restrictive first. */
const OUTCOME_RANKING: Outcome[] = [
  "deny",
  "requireFix",
  "ask",
  "warn",
];

/**
 * Each finding's severity is its rule's, else the config default, else warn.
 * What can be done about it depends on whether the write already happened:
 * a block denies a pending write but can only demand a fix of a landed one,
 * and an ask has no gate left once the write landed, so it warns and tells the human the names.
 * The most restrictive outcome among the findings decides.
 * Every finding of the tool call is listed, deciding ones first,
 * so one deny or ask covers all of them and the agent's re-emit fixes everything at once.
 * When nothing more than a warning is left, failed checks are stated firmly
 * and judge verdicts as advice.
 */
export function buildReport(
  findings: Finding[],
  config: ResolvedConfig,
  { isWritten = false } = {},
): Report | null {
  if (!findings.length) return null;
  const outcomeOf = (finding: Finding) => toOutcome(severityOf(finding, config), isWritten);
  const decision = OUTCOME_RANKING.find((outcome) =>
    findings.some((finding) => outcomeOf(finding) === outcome),
  )!;
  if (decision === "warn") {
    const unasked = findings.filter((finding) => severityOf(finding, config) === "ask");
    return buildWarning(findings, unasked);
  }
  return buildDecision(decision, findings, outcomeOf);
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

/** What a severity can achieve, given whether the write already landed. */
function toOutcome(severity: Severity, isWritten: boolean): Outcome {
  if (severity === "block") return isWritten ? "requireFix" : "deny";
  if (severity === "ask") return isWritten ? "warn" : "ask";
  return "warn";
}

/**
 * Failed checks stated firmly, then judge verdicts as advice.
 * The human gets a count, and the names of the `unasked` findings: those an ask-level rule
 * would have put to them, had the write not already landed.
 */
function buildWarning(findings: Finding[], unasked: Finding[]): Report {
  const checked = findings.filter((finding) => finding.rule.check);
  const judged = findings.filter((finding) => finding.rule.judge);
  const checkSection = formatSection(HEADING_BY_SECTION.warnCheck, checked);
  const judgeSection = formatSection(HEADING_BY_SECTION.warnJudge, judged);
  const text = [checkSection, judgeSection].filter(Boolean).join("\n");
  const itWas = unasked.length === 1 ? "it was" : "they were";
  const noteOnUnasked = unasked.length
    ? `${formatNames(unasked)} would have asked you first, but ${itWas} ${WRITTEN_UNSEEN}`
    : "";
  const summary = [`nij: ${formatCount(findings, "warning")}`, noteOnUnasked]
    .filter(Boolean)
    .join(". ");
  return { decision: "warn", findings: [...checked, ...judged], text, summary };
}

/** The deciding findings under their heading, then every other finding. */
function buildDecision(
  decision: Exclude<Outcome, "warn">,
  findings: Finding[],
  outcomeOf: (finding: Finding) => Outcome,
): Report {
  const deciding = findings.filter((finding) => outcomeOf(finding) === decision);
  const rest = findings.filter((finding) => outcomeOf(finding) !== decision);
  const also = rest.length ? `\nAlso, while you are at it:\n${formatLines(rest)}` : "";
  const text = `${HEADING_BY_SECTION[decision]}\n${formatLines(deciding)}${also}`;
  const summary = decision === "requireFix"
    ? `nij: ${formatCount(deciding, "violation")} got through, ${WRITTEN_UNSEEN}. `
    + "The agent is told to rename."
    : undefined;
  return { decision, findings: [...deciding, ...rest], text, summary };
}

/** A heading over its findings, or nothing when there are none, so empty sections drop out. */
const formatSection = (heading: string, findings: Finding[]) =>
  findings.length ? `${heading}\n${formatLines(findings)}` : "";

/** The findings as a bulleted list. */
const formatLines = (findings: Finding[]) =>
  findings.map((finding) => `- ${formatFinding(finding)}`).join("\n");

/** The findings' names as a list in a sentence: "a", "a and b", "a, b and c". */
function formatNames(findings: Finding[]): string {
  const names = findings.map(({ identifier }) => identifier.name);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** "1 naming warning", "3 naming violations". */
const formatCount = (findings: Finding[], noun: string) =>
  `${findings.length} naming ${noun}${findings.length === 1 ? "" : "s"}`;

/** The text ending in a full stop. Rule messages are written by people, with or without one. */
const endWithFullStop = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

/** The text with its first letter capitalized. A verdict's detail is written as a fragment. */
const capitalize = (text: string) => `${text[0].toUpperCase()}${text.slice(1)}`;
