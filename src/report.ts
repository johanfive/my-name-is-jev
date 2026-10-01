import type { Finding, ResolvedConfig, Severity } from "./types.ts";

/** One decision and one text any agent can act on. Adapters map `decision` onto their protocol. */
export type Report = { decision: Severity; findings: Finding[]; text: string };

/** One line per finding, written for a model to act on. */
export const formatFinding = (f: Finding) =>
  [
    `${f.identifier.name} (${f.identifier.kind}, ${f.identifier.file}): ${f.rule.message}`,
    f.verdict.detail && `${f.verdict.detail[0].toUpperCase()}${f.verdict.detail.slice(1)}.`,
    f.rule.example && `Example: ${f.rule.example}.`,
  ]
    .filter(Boolean)
    .join(" ");

const HEADING: Record<Severity, string> = {
  block: "Naming convention violations. Rename and retry:",
  ask: "Naming convention concerns:",
  warn: "Naming convention warnings (the write went through; fix these next time you touch the code):",
};

const RANK: Severity[] = ["block", "ask", "warn"];
const lines = (fs: Finding[]) => fs.map((f) => `- ${formatFinding(f)}`).join("\n");

/**
 * Severity resolves rule → config → warn. The strongest severity present decides. Every finding of the tool call is
 * listed, deciding ones first, so one deny or ask covers all of them and the agent's re-emit fixes everything at once.
 */
export function report(findings: Finding[], config: ResolvedConfig): Report | null {
  if (!findings.length) return null;
  const severityOf = (f: Finding): Severity => f.rule.severity ?? config.severity;
  const decision = RANK.find((s) => findings.some((f) => severityOf(f) === s))!;
  const deciding = findings.filter((f) => severityOf(f) === decision);
  const rest = findings.filter((f) => severityOf(f) !== decision);
  const text = `${HEADING[decision]}\n${lines(deciding)}${rest.length ? `\nAlso, while you are at it:\n${lines(rest)}` : ""}`;
  return { decision, findings: [...deciding, ...rest], text };
}
