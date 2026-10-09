import { matchesGlob } from "node:path";
import { listSiblings } from "./siblings.ts";
import type { CheckCtx, Finding, Identifier, JudgeCtx, Rule, Selector } from "./types.ts";

/**
 * Pipe identifiers through the rules.
 * Per identifier: every applicable check runs and every failure is kept.
 * Judges run only when no check failed and Jev is available (`createJudgeCtx` non-null),
 * in parallel.
 * A rule that throws is skipped and logged: fail open, always.
 * Only new identifiers are considered.
 */
export async function runRules(
  rules: Rule[],
  identifiers: Identifier[],
  createJudgeCtx: ((id: Identifier) => JudgeCtx) | null,
): Promise<Finding[]> {
  const findingsPerIdentifier = identifiers
    .filter((id) => id.isNew)
    .map((id) => runRulesOn(id, rules, identifiers, createJudgeCtx));
  return (await Promise.all(findingsPerIdentifier)).flat();
}

/** Whether a rule's selector covers the identifier. No selector covers everything. */
export function selects(selector: Selector | undefined, id: Identifier): boolean {
  if (!selector) return true;
  const kindMatches = !selector.kind || selector.kind.includes(id.kind);
  const pathMatches = !selector.path || matchesGlob(id.file, selector.path);
  return kindMatches && pathMatches;
}

/**
 * Every finding for one identifier: its checks, then its judges when every check passed.
 * A judge only refines a name whose shape is already right, and each one costs Jev questions.
 */
async function runRulesOn(
  id: Identifier,
  rules: Rule[],
  identifiers: Identifier[],
  createJudgeCtx: ((id: Identifier) => JudgeCtx) | null,
): Promise<Finding[]> {
  const applicable = rules.filter((rule) => selects(rule.select, id));
  const checkFindings = runChecks(applicable, id, { siblings: listSiblings(identifiers, id) });
  if (checkFindings.length || !createJudgeCtx) return checkFindings;
  return runJudges(applicable, id, createJudgeCtx(id));
}

/** The failures of the identifier's checks. */
function runChecks(rules: Rule[], id: Identifier, ctx: CheckCtx): Finding[] {
  return rules.flatMap((rule): Finding[] => {
    if (!rule.check) return [];
    try {
      const verdict = rule.check(id, ctx);
      return verdict.ok ? [] : [{ rule, identifier: id, verdict }];
    } catch (err) {
      logSkippedRule(rule, id, err);
      return [];
    }
  });
}

/** The failures of the identifier's judges, asked in parallel. */
async function runJudges(rules: Rule[], id: Identifier, ctx: JudgeCtx): Promise<Finding[]> {
  const findingsPerRule = await Promise.all(
    rules.map(async (rule): Promise<Finding[]> => {
      if (!rule.judge) return [];
      try {
        const verdict = await rule.judge(id, ctx);
        return verdict.ok ? [] : [{ rule, identifier: id, verdict }];
      } catch (err) {
        logSkippedRule(rule, id, err);
        return [];
      }
    }),
  );
  return findingsPerRule.flat();
}

/** Log a rule that threw. nij fails open: its own bug never blocks the agent. */
function logSkippedRule(rule: Rule, id: Identifier, err: unknown) {
  process.stderr.write(`nij: rule ${rule.id} skipped on ${id.name}: ${(err as Error).message}\n`);
}
